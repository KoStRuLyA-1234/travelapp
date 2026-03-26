# TravelApp

TravelApp — веб-приложение для путешествий по городам России. Пользователь может просматривать список городов, открывать карточки с описанием, рейтингом и населением, общаться с AI-гидом и получать персональный маршрут поездки.

## Основные возможности

- каталог городов с карточками и детальной страницей
- поиск и фильтрация городов
- регистрация и вход по email / паролю
- сохранение городов в избранное
- AI-гид по городам через OpenRouter
- генерация маршрута по дням с учётом стиля поездки и компании
- отображение маршрута на карте
- экспорт маршрута в PDF
- PWA-режим: manifest, service worker, установка на устройство

## Стек технологий

### Frontend

- Angular 21
- TypeScript
- Angular Router
- Angular Service Worker
- html2canvas + jsPDF
- Yandex Maps API

### Backend

- ASP.NET Core Web API (.NET 8)
- Entity Framework Core
- JWT Authentication
- BCrypt для хеширования паролей

### Database

- PostgreSQL 16

### AI и внешние сервисы

- OpenRouter для AI-гида и генерации маршрутов
- Wikipedia REST API для загрузки фото городов

### Контейнеризация и деплой

- Docker
- Docker Compose
- Nginx
- Vercel для frontend
- Render для backend
- Render PostgreSQL для базы данных

## Архитектура проекта

Проект состоит из четырёх основных частей:

1. **Frontend (Angular)**  
   Отвечает за интерфейс, маршруты приложения, экраны городов, профиль, избранное, AI-чат и планировщик маршрута.

2. **Backend (ASP.NET Core Web API)**  
   Обрабатывает API-запросы, авторизацию, работу с городами, вызовы OpenRouter и генерацию маршрутов.

3. **Database (PostgreSQL)**  
   Хранит данные о городах и пользователях.

4. **AI и внешние API**  
   OpenRouter используется для ответов AI-гида и построения маршрутов, Wikipedia — для получения фотографий, Yandex Maps — для отображения карты и маршрута на frontend.

## Структура проекта

```text
TRAVELAPP/
├─ TravelApp.Client/              # Angular frontend
│  ├─ src/
│  │  ├─ app/
│  │  │  ├─ core/                 # модели и сервисы
│  │  │  ├─ features/             # страницы приложения
│  │  │  └─ shared/               # общие компоненты
│  │  ├─ environments/            # environment.ts / environment.prod.ts
│  │  └─ index.html
│  ├─ public/                     # favicon, icons, manifest
│  ├─ Dockerfile
│  ├─ nginx.conf
│  ├─ angular.json
│  └─ ngsw-config.json
├─ TravelApp.Api/
│  └─ TravelApp.Api/
│     ├─ Controllers/             # Auth, Cities, Guide
│     ├─ Data/                    # AppDbContext
│     ├─ Models/                  # City, User
│     ├─ Migrations/              # EF Core migrations
│     ├─ Properties/
│     ├─ Dockerfile
│     ├─ Program.cs
│     └─ appsettings*.json
├─ docker-compose.yml
├─ .env
└─ .env.example
```

## Основные разделы frontend

- `/` — главная страница со списком городов
- `/auth` — регистрация и вход
- `/search` — поиск городов
- `/saved` — избранные города
- `/profile` — профиль пользователя
- `/cities/:id` — детальная страница города
- `/planner/:id` — планировщик маршрута

## Локальный запуск через Docker Compose

### Что понадобится

- Docker
- Docker Compose

### Шаги запуска

1. Создать файл `.env` в корне проекта. Можно взять за основу `.env.example`.
2. Запустить проект командой:

```bash
docker compose up --build
```

3. После запуска будут доступны:

- frontend: `http://localhost:5173`
- backend API: `http://localhost:8081`
- Swagger UI: `http://localhost:8081/swagger`

### Остановка

```bash
docker compose down
```

Если нужно остановить и удалить volume PostgreSQL:

```bash
docker compose down -v
```

## Переменные окружения

Для локального запуска через Docker Compose используются переменные из `.env`.

| Переменная | Где используется | Назначение |
|---|---|---|
| `OPENROUTER_API_KEY` | backend | ключ доступа к OpenRouter |
| `JWT_KEY` | backend | ключ подписи JWT-токенов |
| `POSTGRES_PASSWORD` | db / backend | пароль PostgreSQL |

### Дополнительно для backend вне Docker

Если backend запускать отдельно, он также читает:

| Переменная | Назначение |
|---|---|
| `ConnectionStrings__DefaultConnection` | строка подключения к PostgreSQL |
| `CorsOrigins__0` | разрешённый frontend origin |
| `CorsOrigins__1` | дополнительный origin при необходимости |

## Как устроен деплой

Текущая схема деплоя:

- **frontend** деплоится на **Vercel**
- **backend** деплоится на **Render**
- **PostgreSQL** размещён на **Render**

### Как это работает

- В development frontend использует `https://localhost:7096` из `src/environments/environment.ts`
- В production frontend использует URL backend из `src/environments/environment.prod.ts`
- Для локального полного запуска используется `docker-compose.yml`
- Для docker-сборки frontend используется отдельный Nginx-контейнер
- Для docker-сборки backend используется отдельный .NET runtime-контейнер

## Ссылки

- Frontend: `https://<frontend-url>`
- Backend API: `https://<backend-url>`

## Краткое описание API

### Auth

- `POST /api/auth/register` — регистрация пользователя
- `POST /api/auth/login` — вход и получение JWT

### Cities

- `GET /api/cities` — список городов
- `GET /api/cities/{id}` — один город по id
- `GET /api/cities/{id}/photo` — получить фото города
- `POST /api/cities` — добавить город
- `PUT /api/cities/{id}` — обновить город
- `DELETE /api/cities/{id}` — удалить город

### Guide

- `POST /api/guide` — AI-ответ по городу
- `POST /api/guide/route` — генерация маршрута поездки

## Что можно улучшить в будущем

- добавить полноценные route guards и расширить серверную защиту приватных разделов
- вынести секреты из `appsettings.json` полностью в переменные окружения
- добавить CI/CD для автоматической сборки и деплоя
- расширить модель данных: хранение маршрутов и избранного на backend
- добавить автоматические тесты для backend API
- добавить админский интерфейс для управления городами
- улучшить мониторинг и логирование production-окружения

## Примечания

- Backend автоматически применяет EF Core миграции при старте.
- В Docker Compose поднимаются три сервиса: `frontend`, `backend`, `db`.
- В локальном Docker-окружении frontend проксирует `/api` на backend через Nginx.
- PWA включается только в production-сборке.

## Статус проекта

Проект находится в рабочем состоянии и уже покрывает основной пользовательский сценарий: просмотр городов, взаимодействие с AI-гидом, построение маршрута и запуск в контейнерах.
