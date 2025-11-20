# MyGrape - Supply Chain Tracking Platform

A comprehensive supply chain tracking platform with real-time monitoring, patient management, shipment tracking, and quality control.

## 🚀 Quick Start

**New Developer?** Start here: **[DEVELOPER_SETUP_GUIDE.md](./DEVELOPER_SETUP_GUIDE.md)**

The developer setup guide contains complete, step-by-step instructions for setting up the entire development environment from scratch. No questions needed!

## 📁 Project Structure

- **`backend/`** - FastAPI REST API server
- **`FrontEnd/`** - React + TypeScript web application  
- **`publisher/`** - Quality data publisher service (Redis Pub/Sub)

## 📚 Documentation

- **[Developer Setup Guide](./DEVELOPER_SETUP_GUIDE.md)** - Complete setup instructions for new developers
- **[Backend README](./backend/README.md)** - Backend API documentation
- **[Frontend README](./FrontEnd/README.md)** - Frontend documentation
- **[Publisher README](./publisher/README.md)** - Publisher service documentation

## 🛠️ Tech Stack

### Backend
- Python 3.12+
- FastAPI
- SQLAlchemy
- PostgreSQL
- Redis
- Poetry (dependency management)

### Frontend
- React 19
- TypeScript
- Vite
- Material-UI
- Tailwind CSS

## 🏃 Running the Application

See **[DEVELOPER_SETUP_GUIDE.md](./DEVELOPER_SETUP_GUIDE.md)** for detailed instructions.

**Quick Start:**
1. Setup database and Redis (see guide)
2. Configure environment variables (see guide)
3. Start backend: `cd backend && poetry run uvicorn app.main:app --reload`
4. Start frontend: `cd FrontEnd && npm run dev`
5. Start publisher: `cd publisher && python -m publisher.publisher`

## 📝 License

[Add your license information here]

## 👥 Authors

- Surya Senthilkumar - surya.senthilkumar@zucisystems.com
- Jothika Rajendran - jothika.rajendran@zucisystems.com