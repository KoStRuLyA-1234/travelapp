import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { CityService } from '../../core/services/city.service';
import { City, CityFilters } from '../../core/models/city.model';

@Component({
  selector: 'app-search',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './search.html',
  styleUrl: './search.css'
})
export class Search implements OnInit {
  /** Result set actually shown — already filtered by tag client-side. */
  filteredCities: City[] = [];
  /** Server response cache so the tag chip filter doesn't re-fetch. */
  private allCities: City[] = [];

  searchQuery = '';
  selectedRegion = '';
  selectedType = '';
  selectedTag = '';

  filters: CityFilters = { regions: [], attractionTypes: [] };
  /** Top tags in result set, deduped + sorted by frequency. */
  topTags: string[] = [];
  isLoading = false;

  constructor(
    private cityService: CityService,
    private router: Router
  ) {}

  ngOnInit() {
    this.cityService.getFilters().subscribe({
      next: filters => this.filters = filters
    });
    this.loadResults();
  }

  loadResults() {
    this.isLoading = true;
    this.cityService.getCities({
      q: this.searchQuery.trim(),
      region: this.selectedRegion,
      type: this.selectedType
    }).subscribe({
      next: (data) => {
        this.allCities = data;
        this.recomputeTopTags();
        this.applyTagFilter();
        this.isLoading = false;
      },
      error: () => {
        this.allCities = [];
        this.filteredCities = [];
        this.topTags = [];
        this.isLoading = false;
      }
    });
  }

  selectRegion(region: string) {
    this.selectedRegion = this.selectedRegion === region ? '' : region;
    this.loadResults();
  }

  selectType(type: string) {
    this.selectedType = this.selectedType === type ? '' : type;
    this.loadResults();
  }

  /** Toggle tag filter — purely client-side over the cached list. */
  selectTag(tag: string) {
    this.selectedTag = this.selectedTag === tag ? '' : tag;
    this.applyTagFilter();
  }

  /** Build a chip list of the 12 most common tags across the current result set. */
  private recomputeTopTags() {
    const counts = new Map<string, number>();
    for (const c of this.allCities) {
      for (const t of this.cityTags(c)) {
        counts.set(t, (counts.get(t) ?? 0) + 1);
      }
    }
    this.topTags = [...counts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 12)
      .map(([tag]) => tag);
  }

  private applyTagFilter() {
    if (!this.selectedTag) {
      this.filteredCities = this.allCities;
      return;
    }
    const needle = this.selectedTag.toLowerCase();
    this.filteredCities = this.allCities.filter(c =>
      this.cityTags(c).some(t => t.toLowerCase() === needle)
    );
  }

  /** Split a city's `tags` field ("море,столица,культура") into trimmed tokens. */
  cityTags(city: City): string[] {
    if (!city.tags) return [];
    return city.tags.toString()
      .split(',')
      .map(t => t.trim())
      .filter(Boolean);
  }

  openCity(id: number) {
    this.router.navigate(['/cities', id]);
  }

  getPhotoUrl(city: City): string {
    if (city.imageUrl && city.imageUrl.startsWith('http')) return city.imageUrl;
    const query = city.searchQuery || city.name;
    return `https://source.unsplash.com/800x600/?${encodeURIComponent(query)}`;
  }
}
