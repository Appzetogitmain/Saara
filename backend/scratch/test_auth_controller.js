import dotenv from 'dotenv';
import * as authController from '../src/modules/vendor/controllers/auth.controller.js';

dotenv.config();

console.log('Successfully imported authController!');
console.log('Available exports:', Object.keys(authController));
