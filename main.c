
#include <stdio.h>
#include "inventory.h"

int main(void) {
    int choice;

    load_medicines();

    while (1) {
        printf("\n===== MediTrack Pro Backend =====\n");
        printf("1. Add medicine\n");
        printf("2. List medicines\n");
        printf("3. Exit\n");
        printf("Choose an option: ");

        if (scanf("%d", &choice) != 1) {
            printf("Invalid input. Restart the program and try again.\n");
            return 1;
        }

        switch (choice) {
            case 1:
                add_medicine();
                break;

            case 2:
                list_medicines();
                break;

            case 3:
                printf("Exiting MediTrack Pro.\n");
                return 0;

            default:
                printf("Invalid choice.\n");
        }
    }
}
