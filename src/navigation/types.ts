import type { NavigatorScreenParams } from "@react-navigation/native";

export type RootStackParamList = {
  Main: NavigatorScreenParams<MainTabsParamList> | undefined;
  Auth: undefined;
};

export type SearchStackParamList = {
  SearchMap: undefined;
  SpotDetail: { spotId: string };
  BookSpot: { spotId: string };
};

export type MyListingsStackParamList = {
  MyListings: undefined;
  CreateListing: { spotId?: string } | undefined;
  SellerOnboarding: undefined;
};

export type BookingsStackParamList = {
  BookingsList: undefined;
  BookingDetail: { bookingId: string };
};

export type ProfileStackParamList = {
  Profile: undefined;
  SellerOnboarding: undefined;
  DocumentCheck: undefined;
};

export type MessagesStackParamList = {
  Inbox: undefined;
  Conversation: { bookingId: string };
};

export type MainTabsParamList = {
  SearchTab: undefined;
  MyListingsTab: undefined;
  BookingsTab: undefined;
  ProfileTab: undefined;
  MessagesTab: NavigatorScreenParams<MessagesStackParamList> | undefined;
};
