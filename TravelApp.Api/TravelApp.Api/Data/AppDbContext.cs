using Microsoft.EntityFrameworkCore;
using TravelApp.Api.Models;

namespace TravelApp.Api.Data
{
    public class AppDbContext : DbContext
    {
        public AppDbContext(DbContextOptions<AppDbContext> options)
            : base(options)
        {
        }

        public DbSet<City> Cities { get; set; }
        public DbSet<User> Users { get; set; }
        public DbSet<Attraction> Attractions { get; set; }
        public DbSet<Favorite> Favorites { get; set; }
        public DbSet<Review> Reviews { get; set; }
        public DbSet<TravelRoute> TravelRoutes { get; set; }
        public DbSet<RouteStop> RouteStops { get; set; }
        public DbSet<LikedRoute> LikedRoutes { get; set; }

        protected override void OnModelCreating(ModelBuilder modelBuilder)
        {
            base.OnModelCreating(modelBuilder);

            modelBuilder.Entity<User>()
                .HasIndex(u => u.Email)
                .IsUnique();

            modelBuilder.Entity<City>()
                .HasIndex(c => c.Name);

            modelBuilder.Entity<City>()
                .HasIndex(c => c.Region);

            modelBuilder.Entity<Attraction>()
                .HasIndex(a => new { a.CityId, a.Type });

            modelBuilder.Entity<Favorite>()
                .HasIndex(f => new { f.UserId, f.CityId })
                .IsUnique();

            modelBuilder.Entity<Favorite>()
                .HasOne(f => f.User)
                .WithMany(u => u.Favorites)
                .HasForeignKey(f => f.UserId)
                .OnDelete(DeleteBehavior.Cascade);

            modelBuilder.Entity<Favorite>()
                .HasOne(f => f.City)
                .WithMany(c => c.Favorites)
                .HasForeignKey(f => f.CityId)
                .OnDelete(DeleteBehavior.Cascade);

            modelBuilder.Entity<Review>()
                .HasIndex(r => new { r.CityId, r.CreatedAt });

            modelBuilder.Entity<Review>()
                .HasOne(r => r.User)
                .WithMany(u => u.Reviews)
                .HasForeignKey(r => r.UserId)
                .OnDelete(DeleteBehavior.Cascade);

            modelBuilder.Entity<Review>()
                .HasOne(r => r.City)
                .WithMany(c => c.Reviews)
                .HasForeignKey(r => r.CityId)
                .OnDelete(DeleteBehavior.Cascade);

            modelBuilder.Entity<Review>()
                .HasOne(r => r.Attraction)
                .WithMany(a => a.Reviews)
                .HasForeignKey(r => r.AttractionId)
                .OnDelete(DeleteBehavior.SetNull);

            modelBuilder.Entity<RouteStop>()
                .HasIndex(s => new { s.TravelRouteId, s.DayNumber, s.StopOrder });

            modelBuilder.Entity<TravelRoute>()
                .Property(r => r.EstimatedBudget)
                .HasColumnType("numeric(12,2)");

            // LikedRoute: unique user+route pair, cascade delete
            modelBuilder.Entity<LikedRoute>()
                .HasIndex(l => new { l.UserId, l.TravelRouteId })
                .IsUnique();

            modelBuilder.Entity<LikedRoute>()
                .HasOne(l => l.User)
                .WithMany(u => u.LikedRoutes)
                .HasForeignKey(l => l.UserId)
                .OnDelete(DeleteBehavior.Cascade);

            modelBuilder.Entity<LikedRoute>()
                .HasOne(l => l.TravelRoute)
                .WithMany()
                .HasForeignKey(l => l.TravelRouteId)
                .OnDelete(DeleteBehavior.Cascade);
        }
    }
}
