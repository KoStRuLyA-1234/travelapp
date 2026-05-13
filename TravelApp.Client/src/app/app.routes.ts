import { Routes } from '@angular/router';
import { HomeComponent } from './features/home/home.component';
import { Search } from './features/search/search';
import { Saved } from './features/saved/saved';
import { Profile } from './features/profile/profile';
import { CityDetail } from './features/city-detail/city-detail';
import { AuthComponent } from './features/auth/auth';
import { RoutePlanner } from './features/route-planner/route-planner';
import { SplashComponent } from './features/splash/splash.component';
import { RouletteComponent } from './features/roulette/roulette.component';
import { SavedRouteComponent } from './features/saved-route/saved-route.component';
import { AdminComponent } from './features/admin/admin.component';
import { authGuard, guestGuard, adminGuard } from './core/guards/auth.guard';

export const routes: Routes = [
  // Public routes — guestGuard kicks logged-in users back to Home so the
  // browser back-button never lands them on Splash/Registration again.
  { path: 'splash', component: SplashComponent, canActivate: [guestGuard] },
  { path: 'auth',   component: AuthComponent,   canActivate: [guestGuard] },

  // Protected routes — require a valid backend JWT.
  { path: '',             component: HomeComponent,    canActivate: [authGuard] },
  { path: 'cities/:id',   component: CityDetail,       canActivate: [authGuard] },
  { path: 'planner/:id',  component: RoutePlanner,     canActivate: [authGuard] },
  { path: 'search',       component: Search,           canActivate: [authGuard] },
  { path: 'saved',        component: Saved,            canActivate: [authGuard] },
  { path: 'roulette',     component: RouletteComponent, canActivate: [authGuard] },
  { path: 'profile',      component: Profile,          canActivate: [authGuard] },
  { path: 'routes/:id',   component: SavedRouteComponent, canActivate: [authGuard] },
  { path: 'admin',        component: AdminComponent,   canActivate: [adminGuard] },

  { path: '**', redirectTo: '' }
];
