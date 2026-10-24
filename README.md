[README.md](https://github.com/user-attachments/files/33911097/README.md)
# MediTrack
MediTrack is a medicine inventory management system built using C, HTML, CSS, and JavaScript. It helps manage medicine records, batch numbers, quantities, expiry dates, and medicine types through a web interface, with a C backend and CSV-based data storage.
# MediTrack — Medicine Inventory Management System

MediTrack is a mini-project for managing medicine inventory through a web interface. The C backend provides an HTTP API, while the frontend uses HTML, CSS, and JavaScript. Medicine records are stored in a CSV file.

## Features

- View medicine inventory records.
- Store medicine name, batch number, quantity, expiry date, and medicine type.
- Add, update, and delete medicine records through the API/frontend, where those controls are available in the current build.
- Save inventory records in `data/medicines.csv`.
- Check the backend API in a web browser.

## Technology used

- C
- Mongoose HTTP library (`mongoose.c` and `mongoose.h`)
- HTML, CSS, and JavaScript
- CSV file storage

## Project files

The repository currently places the backend C source files at the repository root. The frontend and data are kept in folders.

```text
MediTrack/
├── server.c
├── mongoose.c
├── mongoose.h
├── inventory.c
├── inventory.h
├── main.c
├── data/
│   └── medicines.csv
└── frontend/
    ├── index.html
    ├── style.css
    ├── app.js
    └── alerts.js
```

If your downloaded copy has `server.c` and `mongoose.c` inside a `backend` folder instead, use the alternative compile command in Step 4.

## Requirements (Windows)

- Windows 10 or Windows 11
- MSYS2 with the **UCRT64** terminal and GCC, to compile the C backend
- Python 3, to serve the frontend locally
- A modern web browser

## Run MediTrack on your computer

> These instructions run MediTrack locally on your computer. Uploading the code to GitHub does **not** by itself publish a live website.

### Step 1 — Download the project

1. Open this GitHub repository.
2. Click **Code**.
3. Choose **Download ZIP**.
4. Extract the ZIP file to a location you can easily find, such as your Downloads folder.
5. Open the extracted `MediTrack` folder. The `data` and `frontend` folders should be inside it.

### Step 2 — Open the MSYS2 UCRT64 terminal

Open **MSYS2 UCRT64** from the Windows Start menu. Do not use the plain MSYS terminal for these instructions.

If GCC is not installed, run this once in the UCRT64 terminal:

```bash
pacman -S --needed mingw-w64-ucrt-x86_64-gcc
```

Follow the prompts to complete installation.

### Step 3 — Change to the project folder

In the UCRT64 terminal, enter `cd` followed by the path to your extracted project folder.

Example if you extracted it into Downloads (replace `YourWindowsUsername` with your Windows account folder name):

```bash
cd /c/Users/YourWindowsUsername/Downloads/MediTrack
```

Example if it is on your OneDrive Desktop:

```bash
cd /c/Users/YourWindowsUsername/OneDrive/Desktop/MediTrack
```

Use the path that matches where you extracted the folder. Run the following build command from the project root (the folder that contains `data` and `frontend`).

### Step 4 — Compile the C backend

**If `server.c` and `mongoose.c` are at the project root**, run:

```bash
gcc -Wall -Wextra server.c mongoose.c -o meditrack_server.exe -lws2_32
```

**If `server.c` and `mongoose.c` are inside `backend/`**, run this command instead:

```bash
gcc -Wall -Wextra -Ibackend backend/server.c backend/mongoose.c -o meditrack_server.exe -lws2_32
```

Use only the command that matches your folder layout. Do not compile every `.c` file together: `main.c` may contain a separate program entry point, while this web backend is built from `server.c` and `mongoose.c`.

If compilation succeeds, an executable named `meditrack_server.exe` will be created in the project root.

### Step 5 — Start the backend

In the same UCRT64 terminal, run:

```bash
./meditrack_server.exe
```

Keep this terminal open while using MediTrack. The backend should report that it is running at `http://127.0.0.1:8000`.

### Step 6 — Check the API

Open this address in your browser:

```text
http://127.0.0.1:8000/api/medicines
```

You should see a JSON response containing the medicine records. If the list is empty, check the contents of `data/medicines.csv`.

### Step 7 — Start the frontend

Keep the backend terminal running. Open a **second terminal** (Windows Command Prompt or PowerShell) and change to the same project root folder.

Example for a project extracted to Downloads:

```bat
cd /d "%USERPROFILE%\Downloads\MediTrack"
```

Start a local web server for the frontend:

```bat
py -m http.server 5500 --directory frontend
```

If `py` is not recognized but Python is installed, try:

```bat
python -m http.server 5500 --directory frontend
```

Keep this second terminal open too.

### Step 8 — Open MediTrack

Open your browser and visit:

```text
http://127.0.0.1:5500
```

You should now see the MediTrack interface. Keep both terminals running: one for the C backend on port `8000`, and one for the frontend on port `5500`.

### Step 9 — Stop the application

When finished, click each terminal window and press:

```text
Ctrl+C
```

## Troubleshooting

- **`gcc: command not found`** — Open the MSYS2 **UCRT64** terminal and install GCC using the command in Step 2.
- **The backend does not start / port 8000 is already in use** — Close any other MediTrack backend terminal, then try again.
- **The frontend opens but medicine data does not load** — Confirm the backend terminal is still running, check `http://127.0.0.1:8000/api/medicines`, and confirm `frontend/app.js` uses that API address.
- **The backend cannot find `data/medicines.csv`** — Start `meditrack_server.exe` from the project root, not from inside `backend/`.
- **`py` or `python` is not recognized** — Install Python 3 and enable the option to add Python to PATH, or use another local static-file server.
- **A command says a file cannot be found** — Check that you are in the extracted project root and that the folder layout matches the build command you selected.

## Important notes

- The app described here runs locally; it is not yet a public, hosted website. A separate deployment is required for people to use it through an internet link without running the backend themselves.
- Use only dummy/sample medicine records in a public repository. Do not upload patient information, private data, passwords, API keys, or credentials.
- Keep any third-party library license and copyright notices, including those supplied with Mongoose.
