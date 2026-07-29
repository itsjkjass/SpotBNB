import type { ExpoConfig, ConfigContext } from "expo/config";

const ANDROID_PACKAGE = "com.spotbnb.app";
const IOS_BUNDLE_ID = "com.spotbnb.app";

const GOOGLE_MAPS_API_KEY = process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY ?? "";
const STRIPE_MERCHANT_ID = process.env.EXPO_PUBLIC_STRIPE_MERCHANT_ID ?? "merchant.com.spotbnb.app";

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
    config: {
      googleMapsApiKey: GOOGLE_MAPS_API_KEY,
    },
    infoPlist: {
      NSLocationWhenInUseUsageDescription:
        "SpotBnB uses your location to show nearby parking spots and to help buyers find your listing.",
      NSCameraUsageDescription: "SpotBnB uses your camera to take photos of your parking spot listing.",
      NSPhotoLibraryUsageDescription: "SpotBnB needs access to your photos to upload listing images.",
    },
  },
  android: {
    package: ANDROID_PACKAGE,
    adaptiveIcon: {
      backgroundColor: "#E6F4FE",
      foregroundImage: "./assets/android-icon-foreground.png",
      backgroundImage: "./assets/android-icon-background.png",
      monochromeImage: "./assets/android-icon-monochrome.png",
    },
    predictiveBackGestureEnabled: false,
    permissions: [
      "ACCESS_FINE_LOCATION",
      "ACCESS_COARSE_LOCATION",
      "CAMERA",
      "READ_EXTERNAL_STORAGE",
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
    [
      "@stripe/stripe-react-native",
      {
        merchantIdentifier: STRIPE_MERCHANT_ID,
        enableGooglePay: true,
      },
    ],
    "expo-secure-store",
    "expo-location",
    [
      "expo-image-picker",
      {
        photosPermission: "SpotBnB needs access to your photos to upload listing images.",
        cameraPermission: "SpotBnB uses your camera to take photos of your parking spot listing.",
      },
    ],
    [
      "expo-notifications",
      {
        icon: "./assets/icon.png",
        color: "#0B6E4F",
      },
    ],
  ],
  extra: {
    eas: {
      projectId: process.env.EXPO_PUBLIC_EAS_PROJECT_ID ?? "",
    },
  },
});
