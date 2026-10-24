#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <stdarg.h>

#include "mongoose.h"

#ifdef _WIN32
#include <direct.h>
#else
#include <sys/stat.h>
#endif

#define DATA_FILE "data/medicines.csv"
#define MAX_MEDICINES 2000
#define FIELD_SIZE 256
#define LINE_SIZE 2048
#define JSON_CAPACITY (MAX_MEDICINES * 1100 + 32)

typedef struct {
    int id;
    char name[FIELD_SIZE];
    char batch[FIELD_SIZE];
    int quantity;
    char expiry[32];
    char type[FIELD_SIZE];
} Medicine;

static Medicine medicines[MAX_MEDICINES];
static int medicine_count = 0;

static const char *cors_headers =
    "Content-Type: application/json\r\n"
    "Access-Control-Allow-Origin: *\r\n"
    "Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS\r\n"
    "Access-Control-Allow-Headers: Content-Type\r\n";

static void copy_text(char *dst, size_t size, const char *src) {
    if (size == 0) return;
    snprintf(dst, size, "%s", src != NULL ? src : "");
}

static int method_is(struct mg_http_message *hm, const char *method) {
    size_t len = strlen(method);

    return hm->method.len == len &&
           memcmp(hm->method.buf, method, len) == 0;
}

static void ensure_data_directory(void) {
#ifdef _WIN32
    _mkdir("data");
#else
    mkdir("data", 0755);
#endif
}

/* CSV utilities */

static int parse_csv_line(char *line, char fields[][FIELD_SIZE], int max_fields) {
    int field = 0;
    int pos = 0;
    int quoted = 0;

    memset(fields, 0, (size_t) max_fields * FIELD_SIZE);

    for (char *p = line; *p != '\0' && field < max_fields;) {
        char ch = *p;

        if (ch == '"' && pos == 0 && !quoted) {
            quoted = 1;
            p++;
            continue;
        }

        if (quoted) {
            if (ch == '"' && p[1] == '"') {
                if (pos < FIELD_SIZE - 1) fields[field][pos++] = '"';
                p += 2;
                continue;
            }

            if (ch == '"') {
                quoted = 0;
                p++;
                continue;
            }

            if (pos < FIELD_SIZE - 1) fields[field][pos++] = ch;
            p++;
            continue;
        }

        if (ch == ',') {
            fields[field][pos] = '\0';
            field++;
            pos = 0;
            p++;
            continue;
        }

        if (ch == '\r' || ch == '\n') break;

        if (pos < FIELD_SIZE - 1) fields[field][pos++] = ch;
        p++;
    }

    if (field < max_fields) fields[field][pos] = '\0';
    return field + 1;
}

static void write_csv_field(FILE *file, const char *value) {
    fputc('"', file);

    for (const char *p = value; *p != '\0'; p++) {
        if (*p == '"') fputc('"', file);
        fputc(*p, file);
    }

    fputc('"', file);
}

static int save_data(void) {
    ensure_data_directory();

    FILE *file = fopen(DATA_FILE, "w");
    if (!file) {
        perror("Could not save medicine data");
        return 0;
    }

    fprintf(file,
        "id,name,batch_number,quantity,expiry_date,medicine_type\n");

    for (int i = 0; i < medicine_count; i++) {
        Medicine *m = &medicines[i];

        fprintf(file, "%d,", m->id);
        write_csv_field(file, m->name);
        fputc(',', file);
        write_csv_field(file, m->batch);
        fprintf(file, ",%d,", m->quantity);
        write_csv_field(file, m->expiry);
        fputc(',', file);
        write_csv_field(file, m->type);
        fputc('\n', file);
    }

    fclose(file);
    return 1;
}

static void load_data(void) {
    ensure_data_directory();

    FILE *file = fopen(DATA_FILE, "r");

    if (!file) {
        medicine_count = 0;
        save_data();
        return;
    }

    medicine_count = 0;
    char line[LINE_SIZE];
    char fields[6][FIELD_SIZE];

    while (fgets(line, sizeof(line), file) != NULL) {
        if (medicine_count >= MAX_MEDICINES) break;

        int count = parse_csv_line(line, fields, 6);

        if (count < 5) continue;

        if (strcmp(fields[0], "id") == 0 ||
            strcmp(fields[0], "ID") == 0) {
            continue;
        }

        Medicine m;
        memset(&m, 0, sizeof(m));

        m.id = atoi(fields[0]);
        copy_text(m.name, sizeof(m.name), fields[1]);
        copy_text(m.batch, sizeof(m.batch), fields[2]);
        m.quantity = atoi(fields[3]);
        copy_text(m.expiry, sizeof(m.expiry), fields[4]);

        if (count >= 6 && fields[5][0] != '\0') {
            copy_text(m.type, sizeof(m.type), fields[5]);
        } else {
            copy_text(m.type, sizeof(m.type), "Other");
        }

        if (m.id <= 0 || m.name[0] == '\0') continue;
        if (m.quantity < 0) m.quantity = 0;

        medicines[medicine_count++] = m;
    }

    fclose(file);
}

/* JSON output utilities */

static void json_append(char *out, size_t capacity, size_t *position,
                        const char *format, ...) {
    if (*position >= capacity) return;

    va_list args;
    va_start(args, format);
    int written = vsnprintf(out + *position, capacity - *position, format, args);
    va_end(args);

    if (written <= 0) return;

    size_t remaining = capacity - *position;

    if ((size_t) written >= remaining) {
        *position = capacity - 1;
    } else {
        *position += (size_t) written;
    }
}

static void json_append_string(char *out, size_t capacity, size_t *position,
                               const char *value) {
    json_append(out, capacity, position, "\"");

    for (const unsigned char *p = (const unsigned char *) value; *p; p++) {
        switch (*p) {
            case '"':
                json_append(out, capacity, position, "\\\"");
                break;
            case '\\':
                json_append(out, capacity, position, "\\\\");
                break;
            case '\n':
                json_append(out, capacity, position, "\\n");
                break;
            case '\r':
                json_append(out, capacity, position, "\\r");
                break;
            case '\t':
                json_append(out, capacity, position, "\\t");
                break;
            default:
                if (*p < 0x20) {
                    json_append(out, capacity, position, "\\u%04x",
                                (unsigned int) *p);
                } else {
                    char ch[2] = {(char) *p, '\0'};
                    json_append(out, capacity, position, "%s", ch);
                }
        }
    }

    json_append(out, capacity, position, "\"");
}

static void append_medicine_json(char *out, size_t cap, size_t *pos,
                                 const Medicine *m) {
    json_append(out, cap, pos, "{\"id\":%d,\"name\":", m->id);
    json_append_string(out, cap, pos, m->name);
    json_append(out, cap, pos, ",\"batch\":");
    json_append_string(out, cap, pos, m->batch);
    json_append(out, cap, pos, ",\"quantity\":%d,\"expiry\":", m->quantity);
    json_append_string(out, cap, pos, m->expiry);
    json_append(out, cap, pos, ",\"type\":");
    json_append_string(out, cap, pos, m->type);
    json_append(out, cap, pos, "}");
}

static void send_error(struct mg_connection *c, int status,
                       const char *message) {
    char out[1024];
    size_t pos = 0;

    json_append(out, sizeof(out), &pos, "{\"error\":");
    json_append_string(out, sizeof(out), &pos, message);
    json_append(out, sizeof(out), &pos, "}");

    mg_http_reply(c, status, cors_headers, "%s\n", out);
}

static void send_one_medicine(struct mg_connection *c, int status,
                              const Medicine *m) {
    char out[2048];
    size_t pos = 0;

    append_medicine_json(out, sizeof(out), &pos, m);
    mg_http_reply(c, status, cors_headers, "%s\n", out);
}

static void send_all_medicines(struct mg_connection *c) {
    char *out = (char *) calloc(JSON_CAPACITY, 1);

    if (!out) {
        send_error(c, 500, "Not enough memory");
        return;
    }

    size_t pos = 0;
    json_append(out, JSON_CAPACITY, &pos, "[");

    for (int i = 0; i < medicine_count; i++) {
        if (i > 0) json_append(out, JSON_CAPACITY, &pos, ",");
        append_medicine_json(out, JSON_CAPACITY, &pos, &medicines[i]);
    }

    json_append(out, JSON_CAPACITY, &pos, "]");
    mg_http_reply(c, 200, cors_headers, "%s\n", out);
    free(out);
}

/* JSON input utilities */

static int json_get_string(struct mg_str body,
                           const char *path,
                           char *out,
                           size_t size) {
    char *value = mg_json_get_str(body, path);

    if (value == NULL) {
        return 0;
    }

    if (size == 0) {
        mg_free(value);
        return 0;
    }

    copy_text(out, size, value);
    mg_free(value);

    return 1;
}

static int json_get_string_any(struct mg_str body,
                               const char *first,
                               const char *second,
                               char *out, size_t size) {
    if (json_get_string(body, first, out, size)) return 1;
    if (second && json_get_string(body, second, out, size)) return 1;
    return 0;
}

static int read_request_medicine(struct mg_http_message *hm, Medicine *m) {
    struct mg_str body = hm->body;
    char value[FIELD_SIZE];

    if (!json_get_string(body, "$.name", value, sizeof(value))) return 0;
    copy_text(m->name, sizeof(m->name), value);

    if (!json_get_string_any(body, "$.batch", "$.batch_number",
                             value, sizeof(value))) return 0;
    copy_text(m->batch, sizeof(m->batch), value);

    struct mg_str quantity_token = mg_json_get_tok(body, "$.quantity");

    if (quantity_token.buf == NULL || quantity_token.len == 0) {
        return 0;
    }

    double q = 0.0;

    if (!mg_json_get_num(body, "$.quantity", &q)) {
        return 0;
    }
    if (q < 0 || q > 1000000 || q != (int) q) return 0;
    m->quantity = (int) q;

    if (!json_get_string_any(body, "$.expiry", "$.expiry_date",
                             value, sizeof(value))) return 0;
    copy_text(m->expiry, sizeof(m->expiry), value);

    if (json_get_string_any(body, "$.type", "$.medicine_type",
                            value, sizeof(value))) {
        copy_text(m->type, sizeof(m->type), value);
    } else if (m->type[0] == '\0') {
        copy_text(m->type, sizeof(m->type), "Other");
    }

    if (m->name[0] == '\0' || m->batch[0] == '\0' || m->expiry[0] == '\0') {
        return 0;
    }

    return 1;
}

/* Lookup helpers */

static int find_medicine_index(int id) {
    for (int i = 0; i < medicine_count; i++) {
        if (medicines[i].id == id) return i;
    }
    return -1;
}

static int next_medicine_id(void) {
    int maximum = 0;

    for (int i = 0; i < medicine_count; i++) {
        if (medicines[i].id > maximum) maximum = medicines[i].id;
    }

    return maximum + 1;
}

static int get_request_id(struct mg_http_message *hm) {
    char uri[256];
    int len = (int) hm->uri.len;

    if (len >= (int) sizeof(uri)) len = (int) sizeof(uri) - 1;
    memcpy(uri, hm->uri.buf, (size_t) len);
    uri[len] = '\0';

    int id = 0;

    if (sscanf(uri, "/api/medicines/%d", &id) == 1 && id > 0) {
        return id;
    }

    char value[32] = "";
    mg_http_get_var(&hm->query, "id", value, sizeof(value));
    id = atoi(value);

    return id > 0 ? id : 0;
}

/* API operations */

static void create_medicine(struct mg_connection *c,
                            struct mg_http_message *hm) {
    if (medicine_count >= MAX_MEDICINES) {
        send_error(c, 507, "Medicine inventory is full");
        return;
    }

    Medicine m;
    memset(&m, 0, sizeof(m));
    copy_text(m.type, sizeof(m.type), "Other");

    if (!read_request_medicine(hm, &m)) {
        send_error(c, 400, "Invalid details. Check all medicine fields.");
        return;
    }

    m.id = next_medicine_id();
    medicines[medicine_count++] = m;

    if (!save_data()) {
        medicine_count--;
        send_error(c, 500, "Could not save medicine data");
        return;
    }

    send_one_medicine(c, 201, &m);
}

static void update_medicine(struct mg_connection *c,
                            struct mg_http_message *hm) {
    int id = get_request_id(hm);

    if (id <= 0) {
        send_error(c, 400, "A valid medicine ID is required");
        return;
    }

    int index = find_medicine_index(id);

    if (index < 0) {
        send_error(c, 404, "Medicine not found");
        return;
    }

    Medicine updated = medicines[index];

    if (!read_request_medicine(hm, &updated)) {
        send_error(c, 400, "Invalid details. Check all medicine fields.");
        return;
    }

    updated.id = id;
    Medicine previous = medicines[index];
    medicines[index] = updated;

    if (!save_data()) {
        medicines[index] = previous;
        send_error(c, 500, "Could not save changes");
        return;
    }

    send_one_medicine(c, 200, &medicines[index]);
}

static void delete_medicine(struct mg_connection *c,
                            struct mg_http_message *hm) {
    int id = get_request_id(hm);

    if (id <= 0) {
        send_error(c, 400, "A valid medicine ID is required");
        return;
    }

    int index = find_medicine_index(id);

    if (index < 0) {
        send_error(c, 404, "Medicine not found");
        return;
    }

    Medicine deleted = medicines[index];

    for (int i = index; i < medicine_count - 1; i++) {
        medicines[i] = medicines[i + 1];
    }
    medicine_count--;

    if (!save_data()) {
        for (int i = medicine_count; i > index; i--) {
            medicines[i] = medicines[i - 1];
        }
        medicines[index] = deleted;
        medicine_count++;

        send_error(c, 500, "Could not save deletion");
        return;
    }

    mg_http_reply(c, 200, cors_headers,
                  "{\"success\":true,\"message\":\"Medicine deleted\"}\n");
}

/* HTTP handler */

static void http_event_handler(struct mg_connection *c,
                               int event, void *event_data) {
    if (event != MG_EV_HTTP_MSG) {
        return;
    }

    struct mg_http_message *hm =
        (struct mg_http_message *) event_data;

    /* Handle browser CORS preflight requests */
    if (method_is(hm, "OPTIONS")) {
        mg_http_reply(c, 204, cors_headers, "");
        return;
    }

    /* Main medicine API */
    if (mg_match(hm->uri, mg_str("/api/medicines"), NULL)) {
        if (method_is(hm, "GET")) {
            send_all_medicines(c);
            return;
        }

        if (method_is(hm, "POST")) {
            create_medicine(c, hm);
            return;
        }

        if (method_is(hm, "PUT")) {
            update_medicine(c, hm);
            return;
        }

        if (method_is(hm, "DELETE")) {
            delete_medicine(c, hm);
            return;
        }

        send_error(c, 405, "Method not allowed");
        return;
    }

    /* Individual medicine routes, such as /api/medicines/3 */
    if (mg_match(hm->uri, mg_str("/api/medicines/*"), NULL)) {
        if (method_is(hm, "PUT")) {
            update_medicine(c, hm);
            return;
        }

        if (method_is(hm, "DELETE")) {
            delete_medicine(c, hm);
            return;
        }

        send_error(c, 405, "Method not allowed");
        return;
    }

    send_error(c, 404, "API route not found");
}

/* Program entry point */

int main(void) {
    struct mg_mgr manager;

    printf("=====================================\n");
    printf("         MediTrack Pro Backend\n");
    printf("=====================================\n");

    load_data();

    printf("Loaded %d medicine batch(es).\n", medicine_count);
    printf("Database: %s\n", DATA_FILE);

    mg_mgr_init(&manager);

    struct mg_connection *listener =
        mg_http_listen(
            &manager,
            "http://0.0.0.0:8000",
            http_event_handler,
            NULL
        );

    if (listener == NULL) {
        fprintf(stderr,
                "ERROR: Could not start server on port 8000.\n");
        fprintf(stderr,
                "Check whether another process is using port 8000.\n");

        mg_mgr_free(&manager);
        return 1;
    }

    printf("Backend running at http://127.0.0.1:8000\n");
    printf("API: http://127.0.0.1:8000/api/medicines\n");
    printf("Keep this terminal open while using MediTrack.\n");
    printf("Press Ctrl+C to stop.\n\n");

    for (;;) {
        mg_mgr_poll(&manager, 1000);
    }

    mg_mgr_free(&manager);
    return 0;
}