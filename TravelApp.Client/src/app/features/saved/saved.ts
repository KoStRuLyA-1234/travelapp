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
    const saved = localStorage.getItem('savedCities');
    const savedIds: number[] = saved ? JSON.parse(saved) : [];

    if (savedIds.length === 0) {
      this.isLoading = false;
      return;
    }

    this.cityService.getCities().subscribe({
      next: (data) => {
        this.savedCities = data.filter(c => savedIds.includes(c.id));
        this.isLoading = false;
      }
    });
  }

  openCity(id: number) {
    this.router.navigate(['/cities', id]);
  }

  remove(event: Event, id: number) {
    event.stopPropagation();
    const saved = localStorage.getItem('savedCities');
    let ids: number[] = saved ? JSON.parse(saved) : [];
    ids = ids.filter(i => i !== id);
    localStorage.setItem('savedCities', JSON.stringify(ids));
    this.savedCities = this.savedCities.filter(c => c.id !== id);
  }

  getPhotoUrl(city: City): string {
    if (city.imageUrl && city.imageUrl.startsWith('http')) {
      return city.imageUrl;
    }
    const query = city.searchQuery || city.name;
    return `https://source.unsplash.com/800x600/?${encodeURIComponent(query)}`;
  }
}