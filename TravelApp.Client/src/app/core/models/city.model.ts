export interface City {
  id: number;
  name: string;
  description: string;
  imageUrl: string;
  rating: number;
  population: number;
  tags: string;
  routesCount: number;
  searchQuery?: string;
}

export interface Route {
  id: number;
  cityId: number;
  title: string;
  description: string;
  duration: number;
  imageUrl: string;
  tags: string;
  rating: number;
}
