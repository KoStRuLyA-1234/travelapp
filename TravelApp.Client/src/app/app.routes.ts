import { Routes } from '@angular/router';
import { HomeComponent } from './features/home/home.component';
import { Search } from './features/search/search';
import { Saved } from './features/saved/saved';
import { Profile } from './features/profile/profile';
import { CityDetail } from './features/city-detail/city-detail';
import { AuthComponent } from './features/auth/auth';
import { RoutePlanner } from './features/route-planner/route-planner';

export const routes: Routes = [
  { path: 'auth', component: AuthComponent },
  { path: '', component: HomeComponent },
  { path: 'cities/:id', component: CityDetail },
  { path: 'planner/:id', component: RoutePlanner },
  { path: 'search', component: Search },
  { path: 'saved', component: Saved },
  { path: 'profile', component: Profile },
];