import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { Auth } from '../../core/services/auth';

@Component({
  selector: 'app-profile',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './profile.html',
  styleUrl: './profile.css'
})
export class Profile {

  savedCount = 0;
  user: any = null;
  avatarUrl: string | null = null;
  showSettings = false;
  isDark = false;
  notificationsOn = true;

  constructor(
    private auth: Auth,
    private router: Router
  ) {
    this.user = this.auth.getUser();
    const saved = localStorage.getItem('savedCities');
    const ids = saved ? JSON.parse(saved) : [];
    this.savedCount = ids.length;
    this.avatarUrl = localStorage.getItem('avatarUrl');
    this.isDark = localStorage.getItem('theme') !== 'light';
    this.notificationsOn = localStorage.getItem('notifications') !== 'off';
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
        this.avatarUrl = reader.result as string;
        localStorage.setItem('avatarUrl', this.avatarUrl);
      };
      reader.readAsDataURL(file);
    };
    input.click();
  }

  toggleSettings() {
    this.showSettings = !this.showSettings;
  }

  toggleTheme() {
    this.isDark = !this.isDark;
    localStorage.setItem('theme', this.isDark ? 'dark' : 'light');
    document.body.classList.toggle('light-theme', !this.isDark);
  }

  toggleNotifications() {
    this.notificationsOn = !this.notificationsOn;
    localStorage.setItem('notifications', this.notificationsOn ? 'on' : 'off');
  }
}
