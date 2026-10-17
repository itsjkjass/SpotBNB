export type UserRole = "buyer" | "seller";

export interface UserProfile {
  uid: string;
  email: string;
  displayName: string;
  phone?: string;
  photoURL?: string;
  roles: UserRole[];
  stripeConnectAccountId?: string;
  stripeConnectOnboarded: boolean;
  createdAt: number;
}

export type SpotAvailabilityType = "always" | "recurring_hours";
export type SpotType = "driveway" | "garage" | "lot" | "street" | "other";
export type VehicleSize = "compact" | "standard" | "suv_truck";

export interface ParkingSpot {
  id: string;
  ownerId: string;
  title: string;
  description: string;
  address: string;
  location: {
    latitude: number;
    longitude: number;
  };
  photoUrls: string[];
  pricePerHour?: number; // Legacy records only; never used to calculate new bookings.
  pricePerDay?: number;
  timeZone?: string;
  currency: "cad";
  spotType: SpotType;
  vehicleSizes: VehicleSize[];
  amenities: string[];
  availability: {
    type: SpotAvailabilityType;
    startHour?: number;
    endHour?: number;
  };
  isActive: boolean;
  averageRating: number;
  reviewCount: number;
  createdAt: number;
  updatedAt: number;
}

export type BookingStatus =
  | "pending_payment"
  | "confirmed"
  | "cancelled"
  | "completed";

export interface Booking {
  id: string;
  spotId: string;
  spotTitle: string;
  spotAddress: string;
  buyerId: string;
  sellerId: string;
  startTime: number;
  endTime: number;
  startDate?: string;
  endDate?: string;
  dayCount?: number;
  timeZone?: string;
  pricePerDayCents?: number;
  totalPriceCents: number;
  platformFeeCents: number;
  currency: "cad";
  status: BookingStatus;
  stripePaymentIntentId?: string;
  paymentFlow?: "separate_v1";
  cancellationRequestedAt?: number;
  refundedCents?: number;
  paymentDisputed?: boolean;
  createdAt: number;
}

export interface Review {
  id: string;
  bookingId: string;
  spotId: string;
  authorId: string;
  targetId: string;
  rating: number;
  comment: string;
  createdAt: number;
}
