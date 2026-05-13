import {
  Component, OnInit, OnDestroy, AfterViewInit,
  ElementRef, ViewChild
} from '@angular/core';
import { Router } from '@angular/router';
import { Auth } from '../../core/services/auth';

@Component({
  selector: 'app-splash',
  standalone: true,
  imports: [],
  templateUrl: './splash.component.html',
  styleUrl: './splash.component.css'
})
export class SplashComponent implements OnInit, AfterViewInit, OnDestroy {
  @ViewChild('canvas') canvasRef?: ElementRef<HTMLCanvasElement>;

  show = true;
  private animFrame = 0;
  private particles: Particle[] = [];
  private resizeListener?: () => void;
  private autoSkipTimer = 0;

  constructor(private router: Router, private auth: Auth) {}

  ngOnInit() {
    // Already-seen guard: skip immediately.
    if (typeof sessionStorage !== 'undefined' && sessionStorage.getItem('splashSeen')) {
      this.skip();
      return;
    }

    // Auto-advance to /auth (or /) after 2.6s. The CTA is still visible
    // and clickable for users who want to skip ahead. This keeps the
    // user-flow Splash → Registration → Home automatic.
    this.autoSkipTimer = window.setTimeout(() => this.skip(), 2600);
  }

  ngAfterViewInit() {
    // Defer to next frame so the canvas element has layout.
    requestAnimationFrame(() => this.initParticles());
  }

  ngOnDestroy() {
    cancelAnimationFrame(this.animFrame);
    if (this.autoSkipTimer) {
      clearTimeout(this.autoSkipTimer);
    }
    if (this.resizeListener) {
      window.removeEventListener('resize', this.resizeListener);
    }
  }

  /** Set up canvas particle background. Resilient to missing context. */
  private initParticles() {
    const canvas = this.canvasRef?.nativeElement;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Use device pixel ratio for crisp rendering on retina displays (iPhone 15)
    const dpr = window.devicePixelRatio || 1;

    const resize = () => {
      const w = window.innerWidth;
      const h = window.innerHeight;
      canvas.width  = w * dpr;
      canvas.height = h * dpr;
      canvas.style.width  = w + 'px';
      canvas.style.height = h + 'px';
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      // Re-init particles whenever the viewport resizes
      this.particles = Array.from({ length: 50 }, () => new Particle(w, h));
    };
    this.resizeListener = resize;
    resize();
    window.addEventListener('resize', resize);

    const loop = () => {
      const w = window.innerWidth;
      const h = window.innerHeight;
      ctx.clearRect(0, 0, w, h);
      this.particles.forEach(p => { p.update(); p.draw(ctx); });
      this.animFrame = requestAnimationFrame(loop);
    };
    loop();
  }

  /** CTA: mark splash as seen and route the user appropriately. */
  start() {
    this.skip();
  }

  private skip() {
    // Idempotent — protect against the auto-timer firing after a manual tap.
    if (!this.show) return;
    if (this.autoSkipTimer) clearTimeout(this.autoSkipTimer);

    if (typeof sessionStorage !== 'undefined') {
      sessionStorage.setItem('splashSeen', '1');
    }
    this.show = false;
    const target = this.auth.isLoggedIn() ? '/' : '/auth';
    setTimeout(() => this.router.navigateByUrl(target, { replaceUrl: true }), 220);
  }
}

class Particle {
  x: number; y: number;
  vx: number; vy: number;
  radius: number; alpha: number;
  color: string;
  private w: number; private h: number;

  constructor(w: number, h: number) {
    this.w = w; this.h = h;
    this.x = Math.random() * w;
    this.y = Math.random() * h;
    this.vx = (Math.random() - 0.5) * 0.4;
    this.vy = (Math.random() - 0.5) * 0.4;
    this.radius = Math.random() * 2.5 + 0.6;
    this.alpha = Math.random() * 0.45 + 0.15;
    const colors = ['#2a6f85', '#6ec1d4', '#ffc657', '#f5f6f7', '#182633'];
    this.color = colors[Math.floor(Math.random() * colors.length)];
  }

  update() {
    this.x += this.vx;
    this.y += this.vy;
    if (this.x < 0 || this.x > this.w) this.vx *= -1;
    if (this.y < 0 || this.y > this.h) this.vy *= -1;
  }

  draw(ctx: CanvasRenderingContext2D) {
    ctx.beginPath();
    ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
    ctx.fillStyle = this.color;
    ctx.globalAlpha = this.alpha;
    ctx.fill();
    ctx.globalAlpha = 1;
  }
}
