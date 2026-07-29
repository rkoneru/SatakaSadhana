# SatakaSadhana
SatakaSadhana
Telugu Śatakam (padyalu) practice trainer — modular web app, installable as a PWA, wrappable as a native Android/iOS app via Capacitor.

## Run as a web app

```
npm install
npm start
```

Opens a static server on the `/` folder (serves at http://localhost:5173).

## Run as a mobile app (Capacitor)

First time only:

```
npm install
npx cap add android
npx cap add ios      # macOS + Xcode required
```

Every time you change files in `src/`:

```
npm run cap:sync
npm run cap:android   # opens Android Studio
npm run cap:ios       # opens Xcode
```

Microphone permission must be declared on native builds:
- Android: `android/app/src/main/AndroidManifest.xml` — add `<uses-permission android:name="android.permission.RECORD_AUDIO"/>`
- iOS: `ios/App/App/Info.plist` — add `NSMicrophoneUsageDescription` and `NSSpeechRecognitionUsageDescription`
