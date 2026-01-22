const jwt = require('jsonwebtoken');
const User = require('../models/User');

const auth = async (req, res, next) => {
  try {
    const token = req.header('Authorization')?.replace('Bearer ', '');
    
    console.log(`[AUTH] Checking auth for ${req.method} ${req.path}`);
    console.log(`[AUTH] Token present: ${!!token}`);
    
    if (!token) {
      console.log(`[AUTH] No token found, returning 401`);
      throw new Error();
    }

    let decoded;
    try {
      decoded = jwt.verify(token, process.env.JWT_SECRET);
      console.log(`[AUTH] Token verified, userId=${decoded._id}`);
    } catch (err) {
      console.log(`[AUTH] Token verification failed: ${err.name || err.message}`);
      if (err && err.name === 'TokenExpiredError') {
        return res.status(401).json({ error: 'Token expired' });
      }
      return res.status(401).json({ error: 'Please authenticate.' });
    }
    const user = await User.findOne({ _id: decoded._id });

    if (!user) {
      console.log(`[AUTH] User not found for ID ${decoded._id}`);
      throw new Error();
    }

    console.log(`[AUTH] User authenticated: ${user.email}, role=${user.role}, approval=${user.approvalStatus}`);
    req.token = token;
    req.user = user;
    next();
  } catch (error) {
    console.log(`[AUTH] Authentication failed: ${error.message}`);
    res.status(401).json({ error: 'Please authenticate.' });
  }
};

module.exports = auth; 

// Role-based authorization middleware
module.exports.requireRole = (...roles) => {
  return (req, res, next) => {
    try {
      console.log(`[ROLE-CHECK] Checking roles for ${req.method} ${req.path}, required=${roles.join(',')}`);
      if (!req.user) {
        console.log(`[ROLE-CHECK] No user in request, returning 401`);
        return res.status(401).json({ error: 'Please authenticate.' });
      }
      console.log(`[ROLE-CHECK] User role: ${req.user.role}`);
      if (!roles.includes(req.user.role)) {
        console.log(`[ROLE-CHECK] User role ${req.user.role} not in required roles ${roles}, returning 403`);
        return res.status(403).json({ error: 'Forbidden: insufficient privileges' });
      }
      console.log(`[ROLE-CHECK] Role check passed`);
      next();
    } catch (error) {
      console.log(`[ROLE-CHECK] Error: ${error.message}`);
      res.status(403).json({ error: 'Forbidden' });
    }
  };
};