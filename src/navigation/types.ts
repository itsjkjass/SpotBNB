export type SearchStackParamList = {
  SearchMap: undefined;
  SpotDetail: { spotId: string };
  BookSpot: { spotId: string };
};

export type MyListingsStackParamList = {
  MyListings: undefined;
  CreateListing: { spotId?: string } | undefined;
};

export type BookingsStackParamList = {
  BookingsList: undefined;
  BookingDetail: { bookingId: string };
};

export type ProfileStackParamList = {
  Profile: undefined;
  SellerOnboarding: undefined;
};

export type MainTabsParamList = {
  SearchTab: undefined;
  MyListingsTab: undefined;
  BookingsTab: undefined;
  ProfileTab: undefined;
};
