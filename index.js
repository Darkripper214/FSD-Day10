const express = require('express');
const hbs = require('express-handlebars');
const fetch = require('node-fetch');
const queryString = require('query-string');
const mysql = require('mysql2/promise');
const morgan = require('morgan');

const PORT = parseInt(process.argv[2]) || parseInt(process.env.PORT) || 3456;
const API_KEY = process.env.API_KEY;

const pool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 3306,
  password: process.env.DB_PASSWORD,
  user: process.env.DB_USER,
  database: process.env.DB_DATABASE || 'goodreads',
  connectionLimit: process.env.DB_CONNECTION_LIMIT || 4,
  timezone: '+08:00',
});

const app = express();
app.engine('hbs', hbs({ defaultLayout: 'default.hbs' }));
app.set('view engine', 'hbs');

const startApp = async (app, pool) => {
  try {
    const conn = await pool.getConnection();
    console.log('Ping-ing DB');
    await conn.ping();

    app.listen(PORT, () => console.log(`Running on http://localhost:${PORT}`));
    await conn.release;
  } catch (err) {
    console.log(`Could not start, ${err}`);
  }
};
const landingBtn = [
  ['a', 'b', 'c', 'd', 'e'],
  ['f', 'g', 'h', 'i', 'j'],
  ['k', 'l', 'm', 'n', 'o'],
  ['p', 'q', 'r', 's', 't'],
  ['u', 'v', 'w', 'x', 'y'],
  ['z'],
  ['0', '1', '2', '3', '4'],
  ['5', '6', '7', '8', '9'],
];

const SQL_QUERY_BY_FIRST =
  'SELECT * FROM  book2018 WHERE TITLE LIKE ? LIMIT ? OFFSET ?';
const SQL_LIST_LENGTH = `SELECT COUNT(*) as count FROM book2018 WHERE TITLE LIKE ?`;
const SQL_QUERY_BY_ID = 'SELECT * FROM book2018 WHERE book_id = ?';
const SQL_QUERY_BY_ID_FOR_TITLE =
  'SELECT title FROM book2018 WHERE book_id = ?';

// Error Catching Function
function catchErr(res, err) {
  res.status(400);
  console.log(err);
  res.send(`error ${err}`);
}

// Query Factory Function
function getDBResults(SQL, pool) {
  return async function (params) {
    const conn = await pool.getConnection();
    try {
      const results = await conn.query(SQL, params);
      return results[0];
    } catch (err) {
      console.log(err);
      return Promise.reject(err);
    } finally {
      conn.release();
    }
  };
}

let letterQuery = getDBResults(SQL_QUERY_BY_FIRST, pool);
let lengthQuery = getDBResults(SQL_LIST_LENGTH, pool);
let detailQuery = getDBResults(SQL_QUERY_BY_ID, pool);
let titleQuery = getDBResults(SQL_QUERY_BY_ID_FOR_TITLE, pool);

let bookReviewUrl = 'https://api.nytimes.com/svc/books/v3/reviews.json';

// Morgan used to log all traffic
app.use(morgan('combined'));
app.use(express.static('public'));

// Book Review End Point
app.get('/book/detail/:bookid/review', async (req, res) => {
  let bookid = req.params.bookid;
  try {
    title = await titleQuery(bookid);
    title = title[0].title;
    let queryUrl = queryString.stringifyUrl({
      url: bookReviewUrl,
      query: {
        title,
        'api-key': API_KEY,
      },
    });

    let results = await fetch(queryUrl);

    results = await results.json();
    if (results.fault) {
      throw `${results['fault']['faultstring']}`;
    }
    results.num_results <= 0 ? (resultState = false) : (resultState = true);
    let payload = results.results;

    res.status(200);
    res.type('text/html');
    res.render('bookReview', { payload, resultState });
  } catch (err) {
    catchErr(res, err);
  }
});

// Book Dettail End Point
app.get('/book/detail/:bookid', async (req, res) => {
  let bookid = req.params.bookid;
  try {
    results = await detailQuery([`${bookid}`]);
    result = results[0];
    result.authors = result.authors.split('|');
    result.genres = result.genres.split('|');

    res.status(200);
    res.format({
      'text/html': function () {
        res.render('bookDetail', { result });
      },

      'application/json': function () {
        let payload = {
          bookId: result.book_id,
          title: result.title,
          authors: result.authors,
          summary: result.description,
          pages: result.pages,
          rating: parseFloat(result.rating),
          ratingCount: result.rating_count,
          genre: result.genres,
        };
        res.json(payload);
      },

      default: function () {
        // log the request and respond with 406
        res.status(406).send('Not Acceptable');
      },
    });
  } catch (error) {
    catchErr(res, err);
  }
});

// Book by Letter End Point
app.get('/book/:letter', async (req, res) => {
  let letter = req.params.letter;
  let limit = 10;
  let nextBtnState = true;
  offset = parseInt(req.query.offset) || 0;
  btnState = req.query.btnState;

  btnState === 'next' ? (offset += 10) : (offset = Math.max(0, offset - 10));

  offset <= 0 ? (prevBtnState = false) : (prevBtnState = true);

  try {
    results = await letterQuery([`${letter}%`, limit, offset]);
    resultLength = await lengthQuery([`${letter}%`]);
    listLength = resultLength[0]['count'];
    if (offset + limit - listLength >= 0) {
      nextBtnState = false;
    }
    res.status(200);
    res.type('text/html');
    res.render('bookLetter', {
      results,
      letter,
      prevBtnState,
      nextBtnState,
      offset,
    });
  } catch (err) {
    catchErr(res, err);
  }
});

// Landing
app.get('/', (req, res) => {
  res.status(200);
  res.type('text/html');
  res.render('landing', { landingBtn });
});

app.use('*', (req, res) => {
  res.status(404);
  res.type('text/html');
  res.render('404page');
});

startApp(app, pool);
