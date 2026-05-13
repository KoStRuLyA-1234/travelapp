export interface Attraction {
  id: number;
  cityId: number;
  name: string;
  description: string;
  type: string;
  address: string;
  imageUrl: string;
  latitude?: number | null;
  longitude?: number | null;
  averageVisitMinutes: number;
  priceLevel: string;
  isFree: boolean;
}

export interface Review {
  id: number;
  cityId: number;
  attractionId?: number | null;
  rating: number;
  text: string;
  createdAt: string;
  userName: string;
  isOwn: boolean;
}

export interface City {
  id: number;
  name: string;
  description: string;
  imageUrl: string;
  rating: number;
  population: number;
  tags: string;
  searchQuery?: string;
  region?: string;
  latitude?: number | null;
  longitude?: number | null;
  bestSeason?: string;
  averageTripDays?: number;
  isFavorite?: boolean;
  reviewsCount?: number;
  attractionsCount?: number;
  attractions?: Attraction[];
}

export interface CityFilters {
  regions: string[];
  attractionTypes: string[];
}

export interface CitySearchParams {
  q?: string;
  region?: string;
  type?: string;
  favoritesOnly?: boolean;
}

export interface TravelRoute {
  id: number;
  cityId: number;
  title: string;
  description: string;
  durationDays: number;
  theme: string;
  difficulty: string;
  estimatedBudget?: number | null;
}
