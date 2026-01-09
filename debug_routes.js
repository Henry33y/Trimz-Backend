import express from 'express';
import adminRouter from './routes/admin.routes.js';
import userRouter from './routes/user.routes.js';
// ... just enough to see routes
const app = express();
app.use('/api/v1/admin', adminRouter);

function printRoutes(path, layer) {
    if (layer.route) {
        layer.route.stack.forEach(printRoutes.bind(null, path + layer.route.path));
    } else if (layer.name === 'router' && layer.handle.stack) {
        layer.handle.stack.forEach(printRoutes.bind(null, path + (layer.regexp.source.replace('^', '').replace('\\/?(?=\\/|$)', ''))));
    } else if (layer.method) {
        console.log('%s /%s', layer.method.toUpperCase(), path.split('/').filter(Boolean).join('/'));
    }
}

console.log('--- Routes ---');
app._router.stack.forEach(printRoutes.bind(null, ''));
console.log('--------------');
process.exit(0);
