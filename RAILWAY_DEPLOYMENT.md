# Railway Deployment Guide for EyyBack

This guide will help you deploy the EyyBack API to Railway using GitHub integration.

## Prerequisites

1. A Railway account (sign up at [railway.app](https://railway.app))
2. A GitHub repository with your EyyBack code
3. A MongoDB database (MongoDB Atlas recommended for production)

## Deployment Steps

### 1. Connect GitHub Repository to Railway

1. Go to [Railway Dashboard](https://railway.app/dashboard)
2. Click "New Project"
3. Select "Deploy from GitHub repo"
4. Choose your repository containing the EyyBack code
5. Select the `EyyBack` folder as the root directory

### 2. Configure Environment Variables

In your Railway project dashboard, go to the "Variables" tab and add the following environment variables:

#### Required Variables:
```
MONGODB_URI=mongodb+srv://username:password@cluster.mongodb.net/eyytrike
JWT_SECRET=your-super-secret-jwt-key-here
NODE_ENV=production
```

#### Optional Variables:
```
PORT=3000
```

### 3. Database Setup

For production, we recommend using MongoDB Atlas:

1. Create a MongoDB Atlas account at [mongodb.com/cloud/atlas](https://www.mongodb.com/cloud/atlas)
2. Create a new cluster
3. Create a database user
4. Whitelist Railway's IP ranges (or use 0.0.0.0/0 for all IPs)
5. Get your connection string and use it as `MONGODB_URI`

### 4. Deploy

1. Railway will automatically detect your Node.js application
2. It will use the `railway.json` configuration file
3. The deployment will start automatically when you push to your main branch

### 5. Verify Deployment

After deployment, Railway will provide you with a public URL. Test your API:

```bash
# Health check
curl https://your-app.railway.app/api/health

# Root endpoint
curl https://your-app.railway.app/
```

## Configuration Files

### railway.json
This file configures Railway deployment settings including health checks and restart policies.

### env.example
This file shows the required environment variables. Copy this to `.env` for local development.

## Environment Variables Reference

| Variable | Required | Description | Example |
|----------|----------|-------------|---------|
| `MONGODB_URI` | Yes | MongoDB connection string | `mongodb+srv://user:pass@cluster.mongodb.net/eyytrike` |
| `JWT_SECRET` | Yes | Secret key for JWT tokens | `your-secret-key` |
| `PORT` | No | Server port (Railway sets this automatically) | `3000` |
| `NODE_ENV` | No | Environment mode | `production` |
| `RAILWAY_PUBLIC_DOMAIN` | Auto | Railway sets this automatically | `your-app.railway.app` |

## API Endpoints

After deployment, your API will be available at:
- Health Check: `GET /api/health`
- Authentication: `POST /api/auth/login`, `POST /api/auth/register`
- Users: `GET /api/users`, `PUT /api/users/:id`
- Rides: `GET /api/rides`, `POST /api/rides`
- Payments: `GET /api/payments`, `POST /api/payments`
- Wallets: `GET /api/wallets`, `POST /api/wallets`
- Messaging: WebSocket connections for real-time chat

## Troubleshooting

### Common Issues:

1. **Build Fails**: Check that all dependencies are in `package.json`
2. **Database Connection Error**: Verify `MONGODB_URI` is correct and MongoDB Atlas allows connections
3. **Port Issues**: Railway automatically assigns ports, don't hardcode them
4. **Environment Variables**: Ensure all required variables are set in Railway dashboard

### Logs:
View logs in Railway dashboard under the "Deployments" tab to debug issues.

## Security Considerations

1. Use strong JWT secrets
2. Configure CORS appropriately for your frontend domains
3. Use MongoDB Atlas with proper user permissions
4. Enable MongoDB Atlas network access controls
5. Consider using Railway's built-in secrets management

## Updating Your Application

1. Push changes to your GitHub repository
2. Railway will automatically detect changes and redeploy
3. Monitor the deployment in the Railway dashboard

## Cost Management

Railway offers:
- Free tier with usage limits
- Pay-as-you-go pricing for production use
- Automatic scaling based on traffic

Monitor your usage in the Railway dashboard to manage costs.

## Support

- Railway Documentation: [docs.railway.app](https://docs.railway.app)
- Railway Community: [discord.gg/railway](https://discord.gg/railway)
- This Project Issues: Create an issue in your GitHub repository
