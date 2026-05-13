import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { AdminService, AdminUser, AdminRoute } from '../../core/services/admin';

/**
 * Admin panel — only reachable when JWT.role === "Admin".
 *
 * Two stacked sections:
 *   1. Users — search by email, see route count, delete user.
 *   2. Routes — filter by user / tag / date range, open or delete route.
 */
@Component({
  selector: 'app-admin',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './admin.component.html',
  styleUrl: './admin.component.css'
})
export class AdminComponent implements OnInit {
  activeTab: 'users' | 'routes' = 'users';

  // Users
  users: AdminUser[] = [];
  emailFilter = '';
  isLoadingUsers = false;
  usersError = '';

  // Routes
  routes: AdminRoute[] = [];
  routeUserId: number | null = null;
  routeTag = '';
  routeFrom = '';
  routeTo = '';
  isLoadingRoutes = false;
  routesError = '';

  constructor(private admin: AdminService, private router: Router) {}

  ngOnInit() {
    this.loadUsers();
    this.loadRoutes();
  }

  // ── Users ────────────────────────────────────────────────────────
  loadUsers() {
    this.isLoadingUsers = true;
    this.usersError = '';
    this.admin.listUsers(this.emailFilter).subscribe({
      next: (rows) => { this.users = rows; this.isLoadingUsers = false; },
      error: () => { this.usersError = 'Не удалось загрузить пользователей.'; this.isLoadingUsers = false; }
    });
  }

  filterByUser(u: AdminUser) {
    this.routeUserId = u.id;
    this.activeTab = 'routes';
    this.loadRoutes();
  }

  deleteUser(u: AdminUser) {
    if (!confirm(`Удалить пользователя ${u.email} вместе с его маршрутами?`)) return;
    this.admin.deleteUser(u.id).subscribe({
      next: () => { this.users = this.users.filter(x => x.id !== u.id); }
    });
  }

  // ── Routes ───────────────────────────────────────────────────────
  loadRoutes() {
    this.isLoadingRoutes = true;
    this.routesError = '';
    this.admin.listRoutes({
      userId: this.routeUserId ?? undefined,
      tag:    this.routeTag.trim(),
      from:   this.routeFrom,
      to:     this.routeTo
    }).subscribe({
      next: (rows) => { this.routes = rows; this.isLoadingRoutes = false; },
      error: () => { this.routesError = 'Не удалось загрузить маршруты.'; this.isLoadingRoutes = false; }
    });
  }

  resetRouteFilters() {
    this.routeUserId = null;
    this.routeTag = '';
    this.routeFrom = '';
    this.routeTo = '';
    this.loadRoutes();
  }

  openRoute(r: AdminRoute) {
    // Admin viewing another user's route — uses /api/admin/routes/:id
    // via the SavedRoute page when the ?admin=1 query is present.
    this.router.navigate(['/routes', r.id], { queryParams: { admin: 1 } });
  }

  deleteRoute(r: AdminRoute, ev: Event) {
    ev.stopPropagation();
    if (!confirm(`Удалить маршрут «${r.title}»?`)) return;
    this.admin.deleteRoute(r.id).subscribe({
      next: () => { this.routes = this.routes.filter(x => x.id !== r.id); }
    });
  }

  routeTags(r: AdminRoute): string[] {
    return (r.tags || '').split(',').map(t => t.trim()).filter(Boolean).slice(0, 4);
  }

  goBack() { this.router.navigate(['/profile']); }
}
