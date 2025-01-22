import React from "react";
import 'bootstrap/dist/css/bootstrap.min.css';

function App() {
    return (
      
    <div className="container" style={{marginTop: '30px'}}>
    <h1>Eskuel Suite</h1>
    <p style={{ marginBottom: 30 }}>
        Die folgenden drei Apps helfen beim Lernen der Datenbankabfragesprache SQL.
    </p>


    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', columnGap: '30px' }}>
        <div className="app-browser-card card">
            <div className="card-header fs-4" style={{ backgroundColor: '#9BB8CD' }}>
                <a href="./browser" style={{ color: 'black' }}>SQL-Browser</a>
            </div>
            <div className="card-body">
                <p>
                    Mit dem SQL-Browser kannst du aus aus einer Liste von Datenbanken auswählen oder deine eigene Datenbank hochladen.
                </p>
                <p style={{ marginBottom: 0 }}>
                    Führe nun SQL-Abfragen aus und sieh dir die Ergebnisse an!
                </p>
            </div>
        </div>
        <div className="app-game-console-card card">
            <div className="card-header fs-4" style={{ backgroundColor: '#EEC759' }}>
                <a href="./game-console" style={{ color: 'black' }}>SQL-Spielekonsole</a>
            </div>
            <div className="card-body">
                <p>
                    Mit der SQL-Spielekonsole kannst du aus aus einer Liste von Spielen auswählen oder dein eigenes Spiel hochladen.
                </p>
                <p style={{ marginBottom: 0 }}>
                    Lasse das Abenteuer beginnen!
                </p>
            </div>
        </div>
        <div className="app-game-editor-card card">
            <div className="card-header fs-4" style={{ backgroundColor: '#B1C381' }}>
                <a href="./game-editor" style={{ color: 'black' }}>SQL-Spieleeditor</a>
            </div>
            <div className="card-body">
                <p>
                    Mit dem SQL-Spieleeditor kannst du Spiele für die SQL-Spielekonsole bearbeiten und selbst erstellen. 
                </p>
                <p style={{ marginBottom: 0 }}>
                    Denke dir eigene Szenarien aus und lass deiner Kreativität freien Lauf!
                </p>
            </div>
        </div>
    </div>
</div>
    );
  }

export default App;
  