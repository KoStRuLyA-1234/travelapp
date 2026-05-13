import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { Auth, CurrentUser } from '../../core/services/auth';
import { CityService } from '../../core/services/city.service';
import { UserRoutesService, SavedRouteSummary } from '../../core/services/user-routes';

@Component({
  selector: 'app-profile',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './profile.html',
  styleUrl: './profile.css'
})
export class Profile {
  savedCount = 0;
  user: CurrentUser | null = null;
  showSettings = false;
  editMode = false;
  isSaving = false;
  isDark = false;
  animationsEnabled = true;
  notificationsOn = true;
  notificationMessage = '';

  // Saved AI routes — loaded on demand when the tab opens.
  savedRoutes: SavedRouteSummary[] = [];
  isLoadingRoutes = false;
  routesError = '';

  /** Profile body has two tabs: 'overview' (default settings/edit) and 'routes'. */
  activeTab: 'overview' | 'routes' = 'overview';

  draft = {
    name: '',
    homeCity: '',
    bio: '',
    avatarUrl: ''
  };

  constructor(
    public  auth: Auth,
    private cityService: CityService,
    private routes: UserRoutesService,
    private router: Router
  ) {
    this.user = this.auth.getUser();
    this.syncDraft();
    this.isDark = (this.user?.theme ?? localStorage.getItem('theme') ?? 'dark') !== 'light';
    this.animationsEnabled = this.user?.animationsEnabled ?? localStorage.getItem('animationsEnabled') !== 'false';
    this.notificationsOn = localStorage.getItem('notifications') !== 'off';
    this.refreshProfile();
    this.loadSavedCount();
    this.loadSavedRoutes();
  }

  setTab(tab: 'overview' | 'routes') {
    this.activeTab = tab;
    if (tab === 'routes' && this.savedRoutes.length === 0 && !this.isLoadingRoutes) {
      this.loadSavedRoutes();
    }
  }

  loadSavedRoutes() {
    this.isLoadingRoutes = true;
    this.routesError = '';
    this.routes.list().subscribe({
      next: rows => {
        this.savedRoutes = rows;
        this.isLoadingRoutes = false;
      },
      error: () => {
        this.routesError = 'Не удалось загрузить сохранённые маршруты.';
        this.isLoadingRoutes = false;
      }
    });
  }

  openSavedRoute(id: number) {
    this.router.navigate(['/routes', id]);
  }

  deleteSavedRoute(id: number, ev: Event) {
    ev.stopPropagation();
    if (!confirm('Удалить маршрут?')) return;
    this.routes.delete(id).subscribe({
      next: () => { this.savedRoutes = this.savedRoutes.filter(r => r.id !== id); }
    });
  }

  /** Tags column may be CSV — split for chip display. */
  routeTags(r: SavedRouteSummary): string[] {
    return (r.tags || '').split(',').map(t => t.trim()).filter(Boolean).slice(0, 4);
  }

  goToAdmin() {
    this.router.navigate(['/admin']);
  }

  refreshProfile() {
    this.auth.me().subscribe({
      next: user => {
        const { token: _, ...currentUser } = user;
        this.user = currentUser;
        this.isDark = currentUser.theme !== 'light';
        this.animationsEnabled = currentUser.animationsEnabled !== false;
        this.syncDraft();
      },
      error: () => this.logout()
    });
  }

  loadSavedCount() {
    this.cityService.getFavoriteIds().subscribe({
      next: ids => this.savedCount = ids.length,
      error: () => this.savedCount = 0
    });
  }

  goToSaved() {
    this.router.navigate(['/saved']);
  }

  logout() {
    this.auth.logout();
    this.router.navigate(['/auth']);
  }

  onAvatarClick() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.onchange = (e: any) => {
      const file = e.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        this.draft.avatarUrl = reader.result as string;
        this.saveProfile();
      };
      reader.readAsDataURL(file);
    };
    input.click();
  }

  saveProfile() {
    if (this.isSaving) return;
    this.isSaving = true;
    this.auth.updateProfile(this.draft).subscribe({
      next: response => {
        const { token: _, ...currentUser } = response;
        this.user = currentUser;
        this.syncDraft();
        this.editMode = false;
        this.isSaving = false;
      },
      error: () => this.isSaving = false
    });
  }

  toggleSettings() {
    this.showSettings = !this.showSettings;
  }

  toggleTheme() {
    this.isDark = !this.isDark;
    const theme = this.isDark ? 'dark' : 'light';
    localStorage.setItem('theme', theme);
    document.body.classList.toggle('light-theme', !this.isDark);
    this.auth.updateProfile({ theme }).subscribe({ error: () => {} });
  }

  toggleAnimations() {
    this.animationsEnabled = !this.animationsEnabled;
    localStorage.setItem('animationsEnabled', String(this.animationsEnabled));
    document.body.classList.toggle('animations-off', !this.animationsEnabled);
    this.auth.updateProfile({ animationsEnabled: this.animationsEnabled }).subscribe({ error: () => {} });
  }

  toggleNotifications() {
    this.notificationsOn = !this.notificationsOn;
    localStorage.setItem('notifications', this.notificationsOn ? 'on' : 'off');
    this.notificationMessage = '';

    if (this.notificationsOn && 'Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission().then(permission => {
        if (permission !== 'granted') {
          this.notificationsOn = false;
          localStorage.setItem('notifications', 'off');
          this.notificationMessage = 'Уведомления не включены в браузере.';
        }
      });
    }
  }

  private syncDraft() {
    this.draft = {
      name: this.user?.name ?? '',
      homeCity: this.user?.homeCity ?? '',
      bio: this.user?.bio ?? '',
      avatarUrl: this.user?.avatarUrl ?? ''
    };
  }
}
