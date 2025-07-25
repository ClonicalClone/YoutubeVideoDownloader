# YouTube Video Downloader

## Overview

This is a full-stack web application for downloading YouTube videos. It features a React frontend with shadcn/ui components and an Express.js backend that uses yt-dlp for video processing. The application provides video analysis, format selection, and download functionality with real-time progress tracking.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend Architecture
- **Framework**: React 18 with TypeScript
- **Build Tool**: Vite for fast development and optimized builds
- **UI Library**: shadcn/ui components built on Radix UI primitives
- **Styling**: Tailwind CSS with custom dark theme (void black design)
- **State Management**: TanStack Query for server state management
- **Routing**: Wouter for lightweight client-side routing
- **Form Handling**: React Hook Form with Zod validation

### Backend Architecture
- **Framework**: Express.js with TypeScript
- **Runtime**: Node.js with ES modules
- **Database**: PostgreSQL with Drizzle ORM
- **Database Provider**: Neon Database (serverless PostgreSQL)
- **Video Processing**: yt-dlp CLI tool for YouTube video extraction
- **Session Management**: PostgreSQL sessions with connect-pg-simple

### Development Setup
- **Hot Reload**: Vite dev server with HMR for frontend
- **Process Management**: tsx for TypeScript execution in development
- **Build Process**: Vite for frontend bundling, esbuild for backend compilation

## Key Components

### Database Schema
- **Users Table**: Basic user management with username/password
- **Downloads Table**: Tracks download requests with metadata (title, duration, thumbnail, channel info, progress, status)
- **Schema Management**: Drizzle Kit for migrations and schema management

### Video Processing Pipeline
1. **Analysis Phase**: Extract video metadata using yt-dlp
2. **Format Selection**: Present available formats to user
3. **Download Phase**: Process video download with progress tracking
4. **Status Management**: Track download states (pending, downloading, completed, failed)

### Storage Strategy
- **Development**: In-memory storage using MemStorage class
- **Production**: PostgreSQL database with Drizzle ORM
- **File Storage**: Local filesystem for downloaded video files

### API Design
- **RESTful Endpoints**: `/api/analyze` for video analysis, `/api/download` for downloads
- **Error Handling**: Centralized error middleware with proper HTTP status codes
- **Request Logging**: Detailed API request/response logging

## Data Flow

1. **User Input**: User enters YouTube URL in frontend form
2. **Video Analysis**: Frontend calls `/api/analyze` endpoint
3. **Metadata Extraction**: Backend uses yt-dlp to extract video information
4. **Format Presentation**: Available formats displayed to user
5. **Download Initiation**: User selects format and initiates download
6. **Progress Tracking**: Real-time progress updates via periodic polling
7. **Completion**: File becomes available for download upon completion

## External Dependencies

### Core Dependencies
- **@neondatabase/serverless**: Serverless PostgreSQL driver
- **drizzle-orm**: Type-safe SQL ORM for database operations
- **yt-dlp**: Python-based YouTube video downloader (external CLI tool)

### UI Dependencies
- **@radix-ui/react-***: Accessible component primitives
- **@tanstack/react-query**: Server state management
- **class-variance-authority**: Component variant management
- **tailwindcss**: Utility-first CSS framework

### Development Dependencies
- **vite**: Fast build tool and dev server
- **tsx**: TypeScript execution engine
- **esbuild**: Fast JavaScript bundler for backend

## Deployment Strategy

### Build Process
1. **Frontend Build**: Vite builds React app to `dist/public`
2. **Backend Build**: esbuild bundles server code to `dist/index.js`
3. **Static Assets**: Frontend serves from Express in production

### Environment Requirements
- **DATABASE_URL**: PostgreSQL connection string
- **yt-dlp**: Must be installed and available in PATH
- **Node.js**: ES modules support required

### Production Considerations
- **Database Migrations**: Run `npm run db:push` to sync schema
- **File Storage**: Consider cloud storage for production file handling
- **Process Management**: Use process manager like PM2 for production
- **External Dependencies**: Ensure yt-dlp is installed on production server

### Development vs Production
- **Development**: Uses Vite dev server with HMR and in-memory storage
- **Production**: Serves static files from Express with PostgreSQL database
- **Database**: Automatically switches from MemStorage to PostgreSQL based on DATABASE_URL presence