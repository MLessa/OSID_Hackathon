const express = require('express')
const path = require('path')
const { get } = require('request')
const fs = require('fs')
const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database(':memory:');

db.serialize(() => {
  db.run("CREATE TABLE Totem (    totem_id TEXT,    location TEXT, visitingCount INTEGER  );");
  db.run("CREATE TABLE Visitor (    visitor_id TEXT,    name TEXT, registerDate INTEGER  );");
  db.run("CREATE TABLE visitor_totem (    totem_id TEXT,    visitor_id TEXT,    date INTEGER  );");
});


const app = express()

app.use(express.json({ limit: '200mb' }));
app.use(express.urlencoded({ limit: '200mb' }));

app.use(express.json())
app.use(express.urlencoded({ extended: true }))

const viewsDir = path.join(__dirname, 'views')
app.use(express.static(viewsDir))
app.use(express.static(path.join(__dirname, './public')))
app.use(express.static(path.join(__dirname, '../images')))
app.use(express.static(path.join(__dirname, '../media')))
app.use(express.static(path.join(__dirname, '../weights')))
app.use(express.static(path.join(__dirname, '../../dist')))

app.get('/', (req, res) => res.redirect('/dash'))
app.get('/tracker', (req, res) => res.sendFile(path.join(viewsDir, 'tracker.html')))
app.get('/selfie', (req, res) => res.sendFile(path.join(viewsDir, 'selfie.html')))
app.get('/dash', (req, res) => res.sendFile(path.join(viewsDir, 'dash.html')))

app.post('/createTotem', async (req, res) => {
  const { location } = req.body
  if (!location) {
    return res.status(400).send('required param not sent')
  }
  try {
    const id = generateUID();
    db.run("INSERT INTO Totem(totem_id, location, visitingCount) VALUES (?,?,?)", [id, location, 0]);
    return res.status(202).send(Buffer.from(JSON.stringify({ url: `http://localhost:3000/tracker?totemId=${id}`, location: location })))
  } catch (err) {
    console.log(err);
    return res.status(404).send(err.toString())
  }
})

app.post('/trackVisitor', async (req, res) => {
  const { totemId, visitorId } = req.body
  if (!totemId || !visitorId) {
    return res.status(400).send('required param not sent')
  }
  try {

    db.all("SELECT 1 FROM visitor_totem WHERE totem_id = ? and visitor_id = ?", [totemId, visitorId], (err, rows) => {
      if (err) {
        return res.status(404).send(err.toString())
      }
      if (rows.length == 0) {
        db.run("INSERT INTO visitor_totem(totem_id, visitor_id, date) VALUES (?,?, ?)", [totemId, visitorId, new Date().getTime()]);
      }
      return res.status(202).send()
    });

  } catch (err) {
    return res.status(404).send(err.toString())
  }
})

app.post('/updateVisitorMap', async (req, res) => {
  const { totemId, visitingCount } = req.body
  if (!totemId || !visitingCount) {
    return res.status(400).send('required param not sent')
  }
  try {

    db.run("UPDATE Totem set visitingCount = ? WHERE totem_id = ?", [visitingCount, totemId], (err, rows) => {
      if (err) {
        return res.status(404).send(err.toString())
      }
      return res.status(202).send()
    });

  } catch (err) {
    console.log(err);
    return res.status(404).send(err.toString())
  }
})

app.get('/listTotens', async (req, res) => {
  try {

    db.all("SELECT totem_id, location, visitingCount FROM Totem ORDER BY location", [], (err, rows) => {
      if (err) {
        return res.status(404).send(err.toString())
      }
      return res.status(202).send(Buffer.from(JSON.stringify(rows)))
    });
  } catch (err) {
    console.log(err);
    return res.status(404).send(err.toString())
  }
})

function generateUID() {
  var firstPart = (Math.random() * 46656) | 0;
  var secondPart = (Math.random() * 46656) | 0;
  firstPart = ("000" + firstPart.toString(36)).slice(-3);
  secondPart = ("000" + secondPart.toString(36)).slice(-3);
  return firstPart + secondPart;
}

app.get('/listVisitors', async (req, res) => {
  try {

    db.all("SELECT visitor_id, name, registerDate FROM Visitor", [], (err, rows) => {
      if (err) {
        return res.status(404).send(err.toString())
      }
      return res.status(202).send(Buffer.from(JSON.stringify(rows)))
    });
  } catch (err) {
    console.log(err);
    return res.status(404).send(err.toString())
  }
})

app.post('/getTotemById', async (req, res) => {
  const { totemId } = req.body
  if (!totemId) {
    return res.status(400).send('required param not sent')
  }

  try {

    db.all("SELECT * from Totem where totem_id = ?;", [totemId], (err, rows) => {
      if (err) {
        return res.status(404).send(err.toString())
      }
      return res.status(202).send(Buffer.from(JSON.stringify(rows)))
    });
  } catch (err) {
    console.log(err);
    return res.status(404).send(err.toString())
  }
})

app.get('/getHeatMap', async (req, res) => {
  try {

    db.all("SELECT DISTINCT Totem.location, Visitor.name, visitor_totem.date FROM Totem JOIN visitor_totem ON Totem.totem_id = visitor_totem.totem_id JOIN Visitor ON visitor_totem.visitor_id = Visitor.visitor_id  GROUP BY Totem.location, Visitor.name,visitor_totem.date ;", [], (err, rows) => {
      if (err) {
        return res.status(404).send(err.toString())
      }
      return res.status(202).send(Buffer.from(JSON.stringify(rows)))
    });
  } catch (err) {
    console.log(err);
    return res.status(404).send(err.toString())
  }
})

app.post('/saveSelfie', async (req, res) => {
  const { imageDataURL, visitorName } = req.body
  if (!imageDataURL || !visitorName) {
    return res.status(400).send('required params not sent')
  }
  try {

    const id = generateUID();
    db.run("INSERT INTO Visitor(visitor_id, name, registerDate) VALUES (?,?, ?)", [id, visitorName, new Date().getTime()]);
    const base64Data = imageDataURL.replace(/^data:image\/png;base64,/, '')

    fs.writeFile(`./public/selfies/${id}.png`, base64Data, 'base64', (error) => {
      if (error) {
        console.error('Ocorreu um erro ao salvar o arquivo:', error);
        return res.status(500).send(err.toString())
      }
      return res.status(202).send()
    });
  } catch (err) {
    console.log(err);
    return res.status(404).send(err.toString())
  }
})

app.listen(3000, () => console.log('Listening on port 3000!'))

function request(url, returnBuffer = true, timeout = 10000) {
  return new Promise(function (resolve, reject) {
    const options = Object.assign(
      {},
      {
        url,
        isBuffer: true,
        timeout,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 6.1; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/65.0.3325.181 Safari/537.36'
        }
      },
      returnBuffer ? { encoding: null } : {}
    )

    get(options, function (err, res) {
      if (err) return reject(err)
      return resolve(res)
    })
  })
}