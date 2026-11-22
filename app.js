const path = require('path');
const express = require('express');
const cookieParser = require('cookie-parser');
const { engine } = require('express-handlebars');
const config = require('./config');
const { loadUser, requireLogin, requireRole } = require('./middleware/auth');

const app = express();

// View engine: views/layouts/main.hbs wraps every page, views/partials/ holds reusable pieces.
// Money on every page: {{money price}} shows "$1,234.50". The currency is set once, here.
const CURRENCY = 'USD';
const moneyFormat = new Intl.NumberFormat('en-US', { style: 'currency', currency: CURRENCY });
const helpers = {
  money: (value) => (value === null || value === undefined || value === '' ? '-' : moneyFormat.format(Number(value))),
  currency: () => CURRENCY, // {{currency}} shows "USD", e.g. in form labels
  // {{plural count "day" "days"}} shows "1 day" or "3 days".
  plural: (count, one, many) => `${count} ${Number(count) === 1 ? one : many}`,
};
app.engine('hbs', engine({ extname: '.hbs', defaultLayout: 'main', helpers }));
app.set('view engine', 'hbs');
app.set('views', path.join(__dirname, 'views'));

// Middleware (order matters)
app.use(express.urlencoded({ extended: true })); // parse form bodies
app.use(cookieParser(config.cookieSecret));      // signed cookies
app.use(express.static(path.join(__dirname, 'public')));
app.use(loadUser); // who is logged in? (req.user and res.locals.user)

// Which menu tab is active (views/partials/menu.hbs underlines it).
app.use((req, res, next) => {
  res.locals.nav = {
    dashboard: req.path.startsWith('/dashboard'),
    manage: req.path.startsWith('/categories/manage'),
    categories: (req.path.startsWith('/categories') && !req.path.startsWith('/categories/manage')) || req.path.startsWith('/items') || req.path.startsWith('/sellers'),
    products: req.path.startsWith('/listings'),
    cart: req.path.startsWith('/cart'),
    projects: req.path.startsWith('/projects'),
  };
  next();
});

// Routers: one file per feature in routes/. Register new ones here.
app.use('/', require('./routes/auth'));                 // /, /login, /logout
app.use('/dashboard', require('./routes/dashboard'));
// app.use('/auth', require('./routes/auth'));
app.use('/categories', requireLogin, require('./routes/categories'));
app.use('/listings', requireRole('Supplier', 'Rental'), require('./routes/listings'));
app.use('/items', requireLogin, require('./routes/items'));
app.use('/sellers', requireLogin, require('./routes/sellers'));
app.use('/cart', requireRole('Contractor'), require('./routes/cart'));
app.use('/projects', requireRole('Contractor'), require('./routes/projects'));

app.listen(3000, () => {
  console.log('Project Flow listening on port 3000');
});
