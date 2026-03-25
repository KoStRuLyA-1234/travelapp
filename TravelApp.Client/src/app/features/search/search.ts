import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { CityService } from '../../core/services/city.service';
import { City } from '../../core/models/city.model';

@Component({
  selector: 'app-search',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './search.html',
  styleUrl: './search.css'
})
export class Search implements OnInit {

  allCities: City[] = [];
  filteredCities: City[] = [];
  searchQuery = '';
  selectedTag = '';

  allTags: string[] = [];

  constructor(
    private cityService: CityService,
    private router: Router
  ) {}

  ngOnInit() {
    this.cityService.getCities().subscribe({
      next: (data) => {
        this.allCities = data;
        this.filteredCities = data;
        this.extractTags(data);
      }
    });
  }

  extractTags(cities: City[]) {
    const tags = new Set<string>();
    cities.forEach(city => {
      city.tags.toString().split(',').forEach(tag => {
        tags.add(tag.trim());
      });
    });
    this.allTags = Array.from(tags);
  }

  filter() {
    this.filteredCities = this.allCities.filter(city => {
      const matchesQuery = city.name
        .toLowerCase()
        .includes(this.searchQuery.toLowerCase());

      const matchesTag = this.selectedTag === '' ||
        city.tags.toString().includes(this.selectedTag);

      return matchesQuery && matchesTag;
    });
  }

  selectTag(tag: string) {
    this.selectedTag = this.selectedTag === tag ? '' : tag;
    this.filter();
  }

  openCity(id: number) {
    this.router.navigate(['/cities', id]);
  }

  getPhotoUrl(city: City): string {
    if (city.imageUrl && city.imageUrl.startsWith('http')) {
      return city.imageUrl;
    }
    const query = city.searchQuery || city.name;
    return `https://source.unsplash.com/800x600/?${encodeURIComponent(query)}`;
  }
}