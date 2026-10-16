import type { NavigatorScreenParams } from "@react-navigation/native";

export type RootStackParamList = {
  Main: NavigatorScreenParams<MainTabsParamList> | undefined;
  Auth: undefined;
  Help: undefined;
  Privacy: undefined;
  Tutorial: undefined;
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
  SearchTab: NavigatorScreenParams<SearchStackParamList> | undefined;
  MyListingsTab: NavigatorScreenParams<MyListingsStackParamList> | undefined;
  BookingsTab: NavigatorScreenParams<BookingsStackParamList> | undefined;
  ProfileTab: NavigatorScreenParams<ProfileStackParamList> | undefined;
  MessagesTab: NavigatorScreenParams<MessagesStackParamList> | undefined;
};
