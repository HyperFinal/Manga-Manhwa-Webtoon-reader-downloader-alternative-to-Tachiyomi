---
description: How to build an APK for Android
---

To build an APK that you can install on your phone, follow these steps:

1.  **Prepare the web assets**:
    ```bash
    npm run build
    npx cap sync
    ```

2.  **Open Android Studio**:
    ```bash
    npx cap open android
    ```

3.  **Build the APK**:
    - In Android Studio, go to the top menu: **Build** > **Build Bundle(s) / APK(s)** > **Build APK(s)**.
    - Wait for the build to finish. A notification will appear in the bottom right corner.

4.  **Locate the APK**:
    - Click **locate** in the notification, or navigate to:
      `android/app/build/outputs/apk/debug/app-debug.apk`

5.  **Install on Phone**:
    - Transfer this `app-debug.apk` file to your phone (via USB, Google Drive, WhatsApp, etc.).
    - Open the file on your phone and tap **Install**.
    - *Note: You might need to allow installation from unknown sources.*

**Alternative (Direct Run)**:
If your phone is connected via USB and "USB Debugging" is on:
- Just press the **Play** button (green triangle) in Android Studio. It will build and install the app directly on your connected phone.
