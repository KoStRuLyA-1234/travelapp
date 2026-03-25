import { Component, OnInit } from '@angular/core';
import { Router, RouterOutlet, NavigationEnd } from '@angular/router';
import { BottomNavComponent } from './shared/components/bottom-nav/bottom-nav.component';
import { CommonModule } from '@angular/common';
import { Auth } from './core/services/auth';
import { filter } from 'rxjs/operators';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet, BottomNavComponent, CommonModule],
  template: `
    <div class="app-container">
      <router-outlet />
      @if (showNav) {
        <app-bottom-nav />
      }
    </div>
  `,
  styles: [`
    .app-container {
      max-width: 480px;
      margin: 0 auto;
      min-height: 100vh;
      position: relative;
    }
  `]
})
export class App implements OnInit {

  showNav = true;

  constructor(private auth: Auth, private router: Router) {}

  ngOnInit() {
    if (!this.auth.isLoggedIn()) {
      this.router.navigate(['/auth']);
    }

    this.router.events.pipe(
      filter(e => e instanceof NavigationEnd)
    ).subscribe((e: any) => {
      this.showNav = !e.url.includes('/auth') && !e.url.includes('/planner');
    });
  }
}