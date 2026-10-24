
#ifndef INVENTORY_H
#define INVENTORY_H

typedef struct {
    int id;
    char name[100];
    char batch_number[50];
    int quantity;
    char expiry_date[11];
} Medicine;

void load_medicines(void);
void save_medicines(void);
void add_medicine(void);
void list_medicines(void);

/* Remove one medicine using its unique ID. */
int delete_medicine_by_id(int id);

#endif
