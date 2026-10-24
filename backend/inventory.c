
#include <stdio.h>
#include <string.h>
#include "inventory.h"

#define MAX_MEDICINES 100
#define DATA_FILE "data/medicines.csv"

static Medicine medicines[MAX_MEDICINES];
static int medicine_count = 0;

void load_medicines(void) {
    FILE *file = fopen(DATA_FILE, "r");

    if (file == NULL) {
        printf("No saved inventory found. Starting empty.\n");
        return;
    }

    medicine_count = 0;

    while (medicine_count < MAX_MEDICINES) {
        Medicine m;

        int result = fscanf(
            file,
            "%d,%99[^,],%49[^,],%d,%10[^\n]\n",
            &m.id,
            m.name,
            m.batch_number,
            &m.quantity,
            m.expiry_date
        );

        if (result != 5) {
            break;
        }

        medicines[medicine_count++] = m;
    }

    fclose(file);
    printf("Loaded %d saved medicine(s).\n", medicine_count);
}

void save_medicines(void) {
    FILE *file = fopen(DATA_FILE, "w");

    if (file == NULL) {
        printf("Error: Could not save inventory. Check the data folder.\n");
        return;
    }

    for (int i = 0; i < medicine_count; i++) {
        fprintf(
            file,
            "%d,%s,%s,%d,%s\n",
            medicines[i].id,
            medicines[i].name,
            medicines[i].batch_number,
            medicines[i].quantity,
            medicines[i].expiry_date
        );
    }

    fclose(file);
}

void add_medicine(void) {
    if (medicine_count >= MAX_MEDICINES) {
        printf("Inventory is full.\n");
        return;
    }

    Medicine m;

    printf("Medicine name: ");
    if (scanf(" %99[^\n]", m.name) != 1) return;

    printf("Batch number: ");
    if (scanf(" %49s", m.batch_number) != 1) return;

    printf("Quantity: ");
    if (scanf("%d", &m.quantity) != 1 || m.quantity < 0) {
        printf("Invalid quantity.\n");
        return;
    }

    printf("Expiry date (YYYY-MM-DD): ");
    if (scanf(" %10s", m.expiry_date) != 1) return;

    m.id = medicine_count + 1;
    medicines[medicine_count++] = m;

    save_medicines();
    printf("Medicine added and saved successfully!\n");
}

void list_medicines(void) {
    if (medicine_count == 0) {
        printf("No medicines added yet.\n");
        return;
    }

    printf("\n--- MEDICINE INVENTORY ---\n");

    for (int i = 0; i < medicine_count; i++) {
        printf(
            "ID: %d | Name: %s | Batch: %s | Quantity: %d | Expiry: %s\n",
            medicines[i].id,
            medicines[i].name,
            medicines[i].batch_number,
            medicines[i].quantity,
            medicines[i].expiry_date
        );
    }
}
