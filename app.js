const path = require('path');
const express = require('express');
const cookieParser = require('cookie-parser');
const { engine } = require('express-handlebars');
const config = require('./config');

const app = express();

// View engine: views/layouts/main.hbs wraps every page, views/partials/ holds reusable pieces.
app.engine('hbs', engine({ extname: '.hbs', defaultLayout: 'main' }));
app.set('view engine', 'hbs');
app.set('views', path.join(__dirname, 'views'));

// Middleware (order matters)
app.use(express.urlencoded({ extended: true })); // parse form bodies
app.use(cookieParser(config.cookieSecret));      // signed cookies
app.use(express.static(path.join(__dirname, 'public')));

// Routers: one file per feature in routes/. Register new ones here.
app.use('/', require('./routes/index'));
// app.use('/auth', require('./routes/auth'));
app.use('/categories', require('./routes/categories'));
// app.use('/listings', require('./routes/listings'));
// app.use('/cart', require('./routes/cart'));

app.listen(3000, () => {
  console.log('Project Flow listening on port 3000');
});
