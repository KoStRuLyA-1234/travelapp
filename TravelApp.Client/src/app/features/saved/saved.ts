import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { CityService } from '../../core/services/city.service';
import { City } from '../../core/models/city.model';

@Component({
  selector: 'app-saved',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './saved.html',
  styleUrl: './saved.css'
})
export class Saved implements OnInit {
  savedCities: City[] = [];
  isLoading = true;

  constructor(
    private cityService: CityService,
    private router: Router
  ) {}

  ngOnInit() {
    this.loadSaved();
  }

  loadSaved() {
    this.cityService.getFavoriteCities().subscribe({
      next: (data) => {
        this.savedCities = data;
        this.isLoading = false;
      },
      error: () => {
        this.savedCities = [];
        this.isLoading = false;
      }
    });
  }

  openCity(id: number) {
    this.router.navigate(['/cities', id]);
  }

  remove(event: Event, id: number) {
    event.stopPropagation();
    const previous = this.savedCities;
    this.savedCities = this.savedCities.filter(c => c.id !== id);

    this.cityService.removeFavorite(id).subscribe({
      error: () => this.savedCities = previous
    });
  }

  getPhotoUrl(city: City): string {
    if (city.imageUrl && city.imageUrl.startsWith('http')) return city.imageUrl;
    const query = city.searchQuery || city.name;
    return `https://source.unsplash.com/800x600/?${encodeURIComponent(query)}`;
  }
}
