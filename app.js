const path = require('path');
const express = require('express');
const cookieParser = require('cookie-parser');
const { engine } = require('express-handlebars');
const config = require('./config');
const { loadUser, requireLogin, requireRole } = require('./middleware/auth');

const app = express();

// View engine: views/layouts/main.hbs wraps every page, views/partials/ holds reusable pieces.
app.engine('hbs', engine({ extname: '.hbs', defaultLayout: 'main' }));
app.set('view engine', 'hbs');
app.set('views', path.join(__dirname, 'views'));

// Middleware (order matters)
app.use(express.urlencoded({ extended: true })); // parse form bodies
app.use(cookieParser(config.cookieSecret));      // signed cookies
app.use(express.static(path.join(__dirname, 'public')));
app.use(loadUser); // who is logged in? (req.user and res.locals.user)

// Routers: one file per feature in routes/. Register new ones here.
app.use('/', require('./routes/auth'));                 // /, /login, /logout
app.use('/dashboard', require('./routes/dashboard'));
// app.use('/auth', require('./routes/auth'));
app.use('/categories', requireLogin, require('./routes/categories'));
app.use('/listings', requireRole('Supplier', 'Rental'), require('./routes/listings'));
app.use('/items', requireLogin, require('./routes/items'));
// app.use('/cart', require('./routes/cart'));

app.listen(3000, () => {
  console.log('Project Flow listening on port 3000');
});
