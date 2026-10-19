import type { ExpoConfig, ConfigContext } from "expo/config";

const ANDROID_PACKAGE = "com.spotbnb.app";
const IOS_BUNDLE_ID = "com.spotbnb.app";

const GOOGLE_MAPS_API_KEY = process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY ?? "";
const STRIPE_MERCHANT_ID = process.env.EXPO_PUBLIC_STRIPE_MERCHANT_ID;

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name: "SpotBnB",
  slug: "spotbnb",
  scheme: "spotbnb",
  version: "1.0.0",
  orientation: "portrait",
  icon: "./assets/icon.png",
  userInterfaceStyle: "light",
  ios: {
    supportsTablet: true,
    bundleIdentifier: IOS_BUNDLE_ID,
    infoPlist: {
      ITSAppUsesNonExemptEncryption: false,
      NSLocationWhenInUseUsageDescription:
        "SpotBnB uses your location to show nearby parking spots and to help buyers find your listing.",
      NSCameraUsageDescription: "SpotBnB uses your camera for listing photos and optional document checks, including a selfie.",
      NSPhotoLibraryUsageDescription: "SpotBnB lets you choose listing photos and documents for optional checks.",
    },
  },
  android: {
    package: ANDROID_PACKAGE,
    adaptiveIcon: {
      backgroundColor: "#084F38",
      foregroundImage: "./assets/android-icon-foreground.png",
      monochromeImage: "./assets/android-icon-monochrome.png",
    },
    predictiveBackGestureEnabled: false,
    permissions: [
      "ACCESS_FINE_LOCATION",
      "ACCESS_COARSE_LOCATION",
      "CAMERA",
    ],
    config: {
      googleMaps: {
        apiKey: GOOGLE_MAPS_API_KEY,
      },
    },
  },
  web: {
    favicon: "./assets/favicon.png",
  },
  plugins: [
    "expo-font",
    ["expo-splash-screen", {
      backgroundColor: "#084F38",
      image: "./assets/splash-icon.png",
      imageWidth: 180,
      resizeMode: "contain",
      dark: { backgroundColor: "#084F38", image: "./assets/splash-icon.png" },
    }],
    [
      "@stripe/stripe-react-native",
      {
        ...(STRIPE_MERCHANT_ID ? { merchantIdentifier: STRIPE_MERCHANT_ID } : {}),
        enableGooglePay: true,
      },
    ],
    "expo-secure-store",
    "expo-location",
    [
      "expo-image-picker",
      {
        photosPermission: "SpotBnB lets you choose listing photos and documents for optional checks.",
        cameraPermission: "SpotBnB uses your camera for listing photos and optional document checks, including a selfie.",
        microphonePermission: false,
      },
    ],
    [
      "expo-notifications",
      {
        icon: "./assets/notification-icon.png",
        color: "#0B6E4F",
      },
    ],
  ],
  extra: {
    eas: {
      projectId: process.env.EXPO_PUBLIC_EAS_PROJECT_ID ?? "2b8d0c4d-9bb1-4b5b-b66c-a4301ac428a9",
    },
  },
});
