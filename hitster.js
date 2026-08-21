/**
 * Hitster-style music guessing game for the terminal.
 *
 * Tracks stream from Spotify through the Web Playback SDK, so playing requires
 * a Spotify Premium account (the SDK refuses free accounts) and a one-time
 * client id from developer.spotify.com. Auth uses the Authorization Code +
 * PKCE flow, which needs no client secret and therefore works on static
 * hosting like GitHub Pages.
 *
 * The track table below is the official HITSTER - Deutsch deck, all 308 cards.
 * The years are the ones printed on the cards (first release), not the dates
 * Spotify reports: those point at remasters and compilations far more often
 * than at the original release, which makes them useless for scoring.
 */
(function () {
  'use strict';

  // Source of truth for scoring. Spotify is only ever asked for the audio.
  const SONGS = [
    { title: 'Rigoletto: "La Donna E\' Mobile"', artist: 'Enrico Caruso', year: 1908 },
    { title: 'Guajira Guantanamera', artist: 'Joseito Fernandez', year: 1929 },
    { title: 'In the Mood', artist: 'Glenn Miller', year: 1939 },
    { title: 'Pack die Badehose ein', artist: 'Cornelia Froboess', year: 1951 },
    { title: 'That\'s Amore', artist: 'Dean Martin', year: 1953 },
    { title: 'Rock Around The Clock', artist: 'Bill Haley & His Comets', year: 1954 },
    { title: 'Ganz Paris träumt von der Liebe', artist: 'Caterina Valente', year: 1954 },
    { title: 'Ain\'t That A Shame', artist: 'Fats Domino', year: 1955 },
    { title: 'See You Later Alligator', artist: 'Bill Haley & His Comets', year: 1956 },
    { title: 'Heimweh', artist: 'Freddy Quinn', year: 1956 },
    { title: 'Day-O (The Banana Boat Song)', artist: 'Harry Belafonte', year: 1956 },
    { title: 'At The Hop', artist: 'Danny & The Juniors', year: 1957 },
    { title: 'Jailhouse Rock', artist: 'Elvis Presley', year: 1957 },
    { title: 'Johnny B. Goode', artist: 'Chuck Berry', year: 1958 },
    { title: 'Good Golly Miss Molly', artist: 'Little Richard', year: 1958 },
    { title: 'Sugar-Baby', artist: 'Peter Kraus', year: 1958 },
    { title: 'La Bamba', artist: 'Ritchie Valens', year: 1958 },
    { title: 'Lollipop', artist: 'The Chordettes', year: 1958 },
    { title: 'All I Have to Do Is Dream', artist: 'The Everly Brothers', year: 1958 },
    { title: 'Die Gitarre und das Meer', artist: 'Freddy Quinn', year: 1959 },
    { title: 'Itsy Bitsy Teenie Weenie Honolulu Strand Bikini', artist: 'Caterina Valente, Silvio Francesco', year: 1960 },
    { title: 'The Twist', artist: 'Chubby Checker', year: 1960 },
    { title: 'Wonderful World', artist: 'Sam Cooke', year: 1960 },
    { title: 'Ich will keine Schokolade', artist: 'Trude Herr', year: 1960 },
    { title: 'Zuckerpuppe (Aus der Bauchtanz-Truppe)', artist: 'Bill Ramsey', year: 1961 },
    { title: 'The Wanderer', artist: 'Dion', year: 1961 },
    { title: 'Can\'t Help Falling in Love', artist: 'Elvis Presley', year: 1961 },
    { title: 'The Locomotion', artist: 'Little Eva', year: 1962 },
    { title: 'Ich will \'nen Cowboy als Mann', artist: 'Gitte Haenning', year: 1963 },
    { title: 'Ring of Fire', artist: 'Johnny Cash', year: 1963 },
    { title: 'Schuld war nur der Bossa Nova', artist: 'Manuela', year: 1963 },
    { title: 'Surfin\' U.S.A.', artist: 'The Beach Boys', year: 1963 },
    { title: 'It\'s In His Kiss (The Shoop Shoop Song)', artist: 'Betty Everett', year: 1964 },
    { title: 'Schöner fremder Mann', artist: 'Connie Francis', year: 1964 },
    { title: 'Do Wah Diddy Diddy', artist: 'Manfred Mann', year: 1964 },
    { title: 'Oh, Pretty Woman', artist: 'Roy Orbison', year: 1964 },
    { title: 'Liebeskummer lohnt sich nicht', artist: 'Siw Malmkvist', year: 1964 },
    { title: 'Marmor, Stein und Eisen bricht', artist: 'Drafi Deutscher', year: 1965 },
    { title: 'I Got You (I Feel Good)', artist: 'James Brown & The Famous Flames', year: 1965 },
    { title: 'These Boots Are Made for Walkin\'', artist: 'Nancy Sinatra', year: 1965 },
    { title: 'Wooly Bully', artist: 'Sam The Sham & The Pharaohs', year: 1965 },
    { title: 'I Got You Babe', artist: 'Sonny & Cher', year: 1965 },
    { title: '(I Can\'t Get No) Satisfaction', artist: 'The Rolling Stones', year: 1965 },
    { title: 'Siebzehn Jahr, blondes Haar', artist: 'Udo Jürgens', year: 1965 },
    { title: 'When a Man Loves a Woman', artist: 'Percy Sledge', year: 1966 },
    { title: 'Good Vibrations', artist: 'The Beach Boys', year: 1966 },
    { title: 'I\'m a Believer', artist: 'The Monkees', year: 1966 },
    { title: 'You Can\'t Hurry Love', artist: 'The Supremes', year: 1966 },
    { title: 'Respect', artist: 'Aretha Franklin', year: 1967 },
    { title: 'Piece of My Heart', artist: 'Erma Franklin', year: 1967 },
    { title: 'Congratulations', artist: 'Cliff Richard', year: 1968 },
    { title: 'Mama', artist: 'Heintje', year: 1968 },
    { title: 'I Heard It Through The Grapevine', artist: 'Marvin Gaye', year: 1968 },
    { title: 'Born To Be Wild', artist: 'Steppenwolf', year: 1968 },
    { title: 'Space Oddity', artist: 'David Bowie', year: 1969 },
    { title: 'Whole Lotta Love', artist: 'Led Zeppelin', year: 1969 },
    { title: 'Sweet Caroline', artist: 'Neil Diamond', year: 1969 },
    { title: 'Get Back', artist: 'The Beatles', year: 1969 },
    { title: 'He Ain\'t Heavy He\'s My Brother', artist: 'The Hollies', year: 1969 },
    { title: 'Your Song', artist: 'Elton John', year: 1970 },
    { title: 'You Can Get It If You Really Want', artist: 'Jimmy Cliff', year: 1970 },
    { title: 'In the Summertime', artist: 'Mungo Jerry', year: 1970 },
    { title: 'Lola', artist: 'The Kinks', year: 1970 },
    { title: 'Er hat ein knallrotes Gummiboot', artist: 'Wencke Myhre', year: 1970 },
    { title: 'Have You Ever Seen The Rain', artist: 'Creedence Clearwater Revival', year: 1971 },
    { title: 'She\'s A Lady', artist: 'Tom Jones', year: 1971 },
    { title: 'You\'re So Vain', artist: 'Carly Simon', year: 1972 },
    { title: 'Eine neue Liebe ist wie ein neues Leben', artist: 'Jürgen Marcus', year: 1972 },
    { title: 'Piano Man', artist: 'Billy Joel', year: 1973 },
    { title: 'Jolene', artist: 'Dolly Parton', year: 1973 },
    { title: 'Waterloo', artist: 'ABBA', year: 1974 },
    { title: 'I Can Help', artist: 'Billy Swan', year: 1974 },
    { title: 'No Woman No Cry', artist: 'Bob Marley & The Wailers', year: 1974 },
    { title: 'Autobahn', artist: 'Kraftwerk', year: 1974 },
    { title: 'Sweet Home Alabama', artist: 'Lynyrd Skynyrd', year: 1974 },
    { title: 'Tränen lügen nicht', artist: 'Michael Holm', year: 1974 },
    { title: 'Über den Wolken', artist: 'Reinhard Mey', year: 1974 },
    { title: 'December, 1963 (Oh What a Night!)', artist: 'Frankie Valli & The Four Seasons', year: 1975 },
    { title: 'Wann wird\'s mal wieder richtig Sommer', artist: 'Rudi Carrell', year: 1975 },
    { title: 'The Hustle', artist: 'Van McCoy & The Soul City Symphony', year: 1975 },
    { title: 'More Than a Feeling', artist: 'Boston', year: 1976 },
    { title: 'Let\'s Stick Together', artist: 'Bryan Ferry', year: 1976 },
    { title: 'If You Leave Me Now', artist: 'Chicago', year: 1976 },
    { title: 'Ein Bett im Kornfeld', artist: 'Jürgen Drews', year: 1976 },
    { title: 'Disco Inferno', artist: 'The Trammps', year: 1976 },
    { title: 'Don\'t Leave Me This Way', artist: 'Thelma Houston', year: 1976 },
    { title: 'It\'s a Heartache', artist: 'Bonnie Tyler', year: 1977 },
    { title: 'Easy', artist: 'Commodores', year: 1977 },
    { title: 'When I Need You', artist: 'Leo Sayer', year: 1977 },
    { title: 'Blue Bayou', artist: 'Linda Ronstadt', year: 1977 },
    { title: 'Ca plane pour moi', artist: 'Plastic Bertrand', year: 1977 },
    { title: 'Le Freak', artist: 'CHIC', year: 1978 },
    { title: 'Über sieben Brücken musst du gehn', artist: 'Karat', year: 1978 },
    { title: 'Paradise By the Dashboard Light', artist: 'Meat Loaf', year: 1978 },
    { title: 'Born to Be Alive', artist: 'Patrick Hernandez', year: 1978 },
    { title: 'You Make Me Feel (Mighty Real)', artist: 'Sylvester', year: 1978 },
    { title: 'Knock On Wood', artist: 'Amii Stewart', year: 1979 },
    { title: 'Moskau', artist: 'Dschinghis Khan', year: 1979 },
    { title: 'Escape (The Pina Colada Song)', artist: 'Rupert Holmes', year: 1979 },
    { title: 'We Are Family', artist: 'Sister Sledge', year: 1979 },
    { title: 'Upside Down', artist: 'Diana Ross', year: 1980 },
    { title: 'Celebration', artist: 'Kool & The Gang', year: 1980 },
    { title: 'Don\'t Stop Believin\'', artist: 'Journey', year: 1981 },
    { title: 'Bette Davis Eyes', artist: 'Kim Carnes', year: 1981 },
    { title: 'Under Pressure', artist: 'Queen, David Bowie', year: 1981 },
    { title: 'Super Freak', artist: 'Rick James', year: 1981 },
    { title: 'Skandal im Sperrbezirk', artist: 'Spider Murphy Gang', year: 1981 },
    { title: 'Don\'t You Want Me', artist: 'The Human League', year: 1981 },
    { title: 'Start Me Up', artist: 'The Rolling Stones', year: 1981 },
    { title: 'White Wedding', artist: 'Billy Idol', year: 1982 },
    { title: 'Maneater', artist: 'Daryl Hall & John Oates', year: 1982 },
    { title: 'Give It Up', artist: 'KC & The Sunshine Band', year: 1982 },
    { title: 'Ich will Spass', artist: 'Markus', year: 1982 },
    { title: 'Major Tom (Völlig losgelöst)', artist: 'Peter Schilling', year: 1982 },
    { title: 'Africa', artist: 'TOTO', year: 1982 },
    { title: 'Don\'t Go', artist: 'Yazoo', year: 1982 },
    { title: 'Karma Chameleon', artist: 'Culture Club', year: 1983 },
    { title: 'Sweet Dreams (Are Made Of This)', artist: 'Eurythmics', year: 1983 },
    { title: '99 Luftballons', artist: 'Nena', year: 1983 },
    { title: 'Ain\'t Nobody', artist: 'Rufus, Chaka Khan', year: 1983 },
    { title: 'Every Breath You Take', artist: 'The Police', year: 1983 },
    { title: 'Wahnsinn', artist: 'Wolfgang Petry', year: 1983 },
    { title: 'Forever Young', artist: 'Alphaville', year: 1984 },
    { title: 'Smalltown Boy', artist: 'Bronski Beat', year: 1984 },
    { title: 'Dancing In the Dark', artist: 'Bruce Springsteen', year: 1984 },
    { title: 'Männer', artist: 'Herbert Grönemeyer', year: 1984 },
    { title: '1000 und 1 Nacht', artist: 'Klaus Lage', year: 1984 },
    { title: 'Never Ending Story', artist: 'Limahl', year: 1984 },
    { title: 'Purple Rain', artist: 'Prince', year: 1984 },
    { title: 'Heaven', artist: 'Bryan Adams', year: 1985 },
    { title: 'Walk Of Life', artist: 'Dire Straits', year: 1985 },
    { title: 'Rock Me Amadeus', artist: 'Falco', year: 1985 },
    { title: 'Holding Back the Years', artist: 'Simply Red', year: 1985 },
    { title: 'Part-Time Lover', artist: 'Stevie Wonder', year: 1985 },
    { title: 'Don\'t Dream It\'s Over', artist: 'Crowded House', year: 1986 },
    { title: 'True Colors', artist: 'Cyndi Lauper', year: 1986 },
    { title: 'Dancing On The Ceiling', artist: 'Lionel Richie', year: 1986 },
    { title: 'You Can Call Me Al', artist: 'Paul Simon', year: 1986 },
    { title: 'König von Deutschland', artist: 'Rio Reiser', year: 1986 },
    { title: 'Manic Monday', artist: 'The Bangles', year: 1986 },
    { title: 'The Time of My Life', artist: 'Bill Medley, Jennifer Warnes', year: 1987 },
    { title: 'Hungry Eyes', artist: 'Eric Carmen', year: 1987 },
    { title: 'Everywhere', artist: 'Fleetwood Mac', year: 1987 },
    { title: 'Got My Mind Set On You', artist: 'George Harrison', year: 1987 },
    { title: 'I Knew You Were Waiting (For Me)', artist: 'George Michael, Aretha Franklin', year: 1987 },
    { title: 'China In Your Hand', artist: 'T\'Pau', year: 1987 },
    { title: 'I Wanna Dance with Somebody (Who Loves Me)', artist: 'Whitney Houston', year: 1987 },
    { title: 'Westerland', artist: 'Die Ärzte', year: 1988 },
    { title: 'Gimme Hope Jo\'Anna', artist: 'Eddy Grant', year: 1988 },
    { title: 'Orinoco Flow', artist: 'Enya', year: 1988 },
    { title: 'She Drives Me Crazy', artist: 'Fine Young Cannibals', year: 1988 },
    { title: 'Sweet Child O\' Mine', artist: 'Guns N\' Roses', year: 1988 },
    { title: 'The Living Years', artist: 'Mike + The Mechanics', year: 1988 },
    { title: 'Fast Car', artist: 'Tracy Chapman', year: 1988 },
    { title: 'Volare (Nel Blu di Pinto di Blu)', artist: 'Gipsy Kings', year: 1989 },
    { title: 'Lambada', artist: 'Kaoma', year: 1989 },
    { title: 'Right Here Waiting', artist: 'Richard Marx', year: 1989 },
    { title: 'The Best', artist: 'Tina Turner', year: 1989 },
    { title: 'Verdammt ich lieb\' dich', artist: 'Matthias Reim', year: 1990 },
    { title: 'Nothing Compares 2 U', artist: 'Sinéad O\'Connor', year: 1990 },
    { title: 'Beinhart', artist: 'Torfrock', year: 1990 },
    { title: 'Ice Ice Baby', artist: 'Vanilla Ice', year: 1990 },
    { title: 'Nah Neh Nah', artist: 'Vaya Con Dios', year: 1990 },
    { title: 'No Son Of Mine', artist: 'Genesis', year: 1991 },
    { title: 'Smells Like Teen Spirit', artist: 'Nirvana', year: 1991 },
    { title: 'Joyride', artist: 'Roxette', year: 1991 },
    { title: 'Wind of Change', artist: 'Scorpions', year: 1991 },
    { title: 'All That She Wants', artist: 'Ace of Base', year: 1992 },
    { title: 'Why', artist: 'Annie Lennox', year: 1992 },
    { title: 'Jump Around', artist: 'House Of Pain', year: 1992 },
    { title: 'Everybody Hurts', artist: 'R.E.M.', year: 1992 },
    { title: 'Under the Bridge', artist: 'Red Hot Chili Peppers', year: 1992 },
    { title: 'Informer', artist: 'Snow', year: 1992 },
    { title: 'Friday I\'m In Love', artist: 'The Cure', year: 1992 },
    { title: 'Das Boot', artist: 'U96', year: 1992 },
    { title: 'Mr. Vain', artist: 'Culture Beat', year: 1993 },
    { title: 'Alles nur geklaut', artist: 'Die Prinzen', year: 1993 },
    { title: 'Sing Hallelujah!', artist: 'Dr. Alban', year: 1993 },
    { title: 'What Is Love', artist: 'Haddaway', year: 1993 },
    { title: 'I Like To Move It', artist: 'Reel 2 Real', year: 1993 },
    { title: 'Cotton Eye Joe', artist: 'Rednex', year: 1994 },
    { title: 'Zombie', artist: 'The Cranberries', year: 1994 },
    { title: 'Love Is All Around', artist: 'Wet Wet Wet', year: 1994 },
    { title: 'Captain Jack', artist: 'Captain Jack', year: 1995 },
    { title: 'Gangsta\'s Paradise', artist: 'Coolio feat. L.V.', year: 1995 },
    { title: 'MIEF!', artist: 'Die Doofen', year: 1995 },
    { title: 'Wonderwall', artist: 'Oasis', year: 1995 },
    { title: 'Abenteuerland', artist: 'Pur', year: 1995 },
    { title: 'Herz an Herz', artist: 'Blümchen', year: 1996 },
    { title: 'Piu bella cosa', artist: 'Eros Ramazzotti', year: 1996 },
    { title: 'Killing Me Softly With His Song', artist: 'Fugees', year: 1996 },
    { title: 'Return of the Mack', artist: 'Mark Morrison', year: 1996 },
    { title: 'Don\'t Speak', artist: 'No Doubt', year: 1996 },
    { title: 'Barbie Girl', artist: 'Aqua', year: 1997 },
    { title: 'My Heart Will Go On', artist: 'Celine Dion', year: 1997 },
    { title: 'Save Tonight', artist: 'Eagle-Eye Cherry', year: 1997 },
    { title: 'Torn', artist: 'Natalie Imbruglia', year: 1997 },
    { title: 'Engel', artist: 'Rammstein', year: 1997 },
    { title: 'Bitter Sweet Symphony', artist: 'The Verve', year: 1997 },
    { title: 'Warum?', artist: 'Tic Tac Toe', year: 1997 },
    { title: 'The Boy Is Mine', artist: 'Brandy & Monica', year: 1998 },
    { title: 'Believe', artist: 'Cher', year: 1998 },
    { title: 'Die Eine', artist: 'Die Firma', year: 1998 },
    { title: 'Fly Away', artist: 'Lenny Kravitz', year: 1998 },
    { title: 'You Get What You Give', artist: 'New Radicals', year: 1998 },
    { title: 'Stop', artist: 'Spice Girls', year: 1998 },
    { title: 'Gettin\' Jiggy Wit It', artist: 'Will Smith', year: 1998 },
    { title: 'Genie In A Bottle', artist: 'Christina Aguilera', year: 1999 },
    { title: 'Du trägst keine Liebe in dir', artist: 'Echt', year: 1999 },
    { title: 'Praise You', artist: 'Fatboy Slim', year: 1999 },
    { title: 'If You Had My Love', artist: 'Jennifer Lopez', year: 1999 },
    { title: 'It\'s My Life', artist: 'Bon Jovi', year: 2000 },
    { title: 'Oops!...I Did It Again', artist: 'Britney Spears', year: 2000 },
    { title: 'One More Time', artist: 'Daft Punk', year: 2000 },
    { title: 'Could I Have This Kiss Forever', artist: 'Enrique Iglesias, Whitney Houston', year: 2000 },
    { title: 'Lady - Hear Me Tonight', artist: 'Modjo', year: 2000 },
    { title: 'It Wasn\'t Me', artist: 'Shaggy, Rik Rok', year: 2000 },
    { title: 'Dancing in the Moonlight', artist: 'Toploader', year: 2000 },
    { title: 'Fallin\'', artist: 'Alicia Keys', year: 2001 },
    { title: 'Whole Again', artist: 'Atomic Kitten', year: 2001 },
    { title: 'How You Remind Me', artist: 'Nickelback', year: 2001 },
    { title: 'Murder On The Dancefloor', artist: 'Sophie Ellis-Bextor', year: 2001 },
    { title: 'The Ketchup Song', artist: 'Las Ketchup', year: 2002 },
    { title: 'Like a Prayer', artist: 'MadHouse', year: 2002 },
    { title: 'Dilemma', artist: 'Nelly feat. Kelly Rowland', year: 2002 },
    { title: 'Feel', artist: 'Robbie Williams', year: 2002 },
    { title: 'Ein Kompliment', artist: 'Sportfreunde Stiller', year: 2002 },
    { title: 'In Da Club', artist: '50 Cent', year: 2003 },
    { title: 'Crazy In Love (feat. Jay-Z)', artist: 'Beyoncé', year: 2003 },
    { title: 'Where Is The Love?', artist: 'Black Eyed Peas', year: 2003 },
    { title: 'Ab in den Süden', artist: 'Buddy', year: 2003 },
    { title: 'Dragostea din tei', artist: 'O-Zone', year: 2003 },
    { title: 'Hey Ya!', artist: 'Outkast', year: 2003 },
    { title: 'Sick and Tired', artist: 'Anastacia', year: 2004 },
    { title: 'Call on Me', artist: 'Eric Prydz', year: 2004 },
    { title: 'Numb / Encore', artist: 'JAY-Z, Linkin Park', year: 2004 },
    { title: 'Lonely', artist: 'Akon', year: 2005 },
    { title: 'Talk', artist: 'Coldplay', year: 2005 },
    { title: 'Emanuela', artist: 'Fettes Brot', year: 2005 },
    { title: 'Gold Digger', artist: 'Kanye West, Jamie Foxx', year: 2005 },
    { title: 'Because of You', artist: 'Kelly Clarkson', year: 2005 },
    { title: 'Durch den Monsun', artist: 'Tokio Hotel', year: 2005 },
    { title: 'Rehab', artist: 'Amy Winehouse', year: 2006 },
    { title: 'World Hold on', artist: 'Bob Sinclair', year: 2006 },
    { title: 'Put Your Records On', artist: 'Corinne Bailey Rae', year: 2006 },
    { title: 'Das Beste', artist: 'Silbermond', year: 2006 },
    { title: 'No One', artist: 'Alicia Keys', year: 2007 },
    { title: 'Junge', artist: 'Die Ärzte', year: 2007 },
    { title: 'Do You Know? (The Ping Pong Song)', artist: 'Enrique Iglesias', year: 2007 },
    { title: 'Vom selben Stern', artist: 'Ich + Ich', year: 2007 },
    { title: 'Valerie', artist: 'Mark Ronson, Amy Winehouse', year: 2007 },
    { title: 'Relax, Take It Easy', artist: 'MIKA', year: 2007 },
    { title: 'Mercy', artist: 'Duffy', year: 2008 },
    { title: 'Poker Face', artist: 'Lady Gaga', year: 2008 },
    { title: '4 Minutes (feat. Justin Timberlake and Timbaland)', artist: 'Madonna', year: 2008 },
    { title: 'Haus am See', artist: 'Peter Fox', year: 2008 },
    { title: 'Whatcha Say', artist: 'Jason Derulo', year: 2009 },
    { title: 'Fireflies', artist: 'Owl City', year: 2009 },
    { title: 'Hey, Soul Sister', artist: 'Train', year: 2009 },
    { title: 'Barbra Streisand', artist: 'Duck Sauce', year: 2010 },
    { title: 'Firework', artist: 'Katy Perry', year: 2010 },
    { title: 'Waka Waka (This Time for Africa)', artist: 'Shakira', year: 2010 },
    { title: 'Geboren um zu leben', artist: 'Unheilig', year: 2010 },
    { title: 'Set Fire to the Rain', artist: 'Adele', year: 2011 },
    { title: 'Somebody That I Used to Know (feat. Kimbra)', artist: 'Gotye', year: 2011 },
    { title: 'Price Tag', artist: 'Jessie J', year: 2011 },
    { title: 'Can\'t Hold Us (feat. Ray Dalton)', artist: 'Macklemore & Ryan Lewis', year: 2011 },
    { title: 'Moves Like Jagger', artist: 'Maroon 5, Christina Aguilera', year: 2011 },
    { title: 'Hangover', artist: 'Taio Cruz, Flo Rida', year: 2011 },
    { title: 'Nur noch kurz die Welt retten', artist: 'Tim Bendzko', year: 2011 },
    { title: 'Einmal um die Welt', artist: 'CRO', year: 2012 },
    { title: 'Tage wie diese', artist: 'Die Toten Hosen', year: 2012 },
    { title: 'I Love It', artist: 'Icona Pop, Charli XCX', year: 2012 },
    { title: 'Euphoria', artist: 'Loreen', year: 2012 },
    { title: 'Die Nacht von Freitag auf Montag', artist: 'SDP feat. Sido', year: 2012 },
    { title: 'Atemlos durch die Nacht', artist: 'Helene Fischer', year: 2013 },
    { title: 'All of Me', artist: 'John Legend', year: 2013 },
    { title: 'Wrecking Ball', artist: 'Miley Cyrus', year: 2013 },
    { title: 'Counting Stars', artist: 'OneRepublic', year: 2013 },
    { title: 'Happy', artist: 'Pharrell Williams', year: 2013 },
    { title: 'Just Give Me a Reason', artist: 'Pink, Nate Ruess', year: 2013 },
    { title: 'Blurred Lines', artist: 'Robin Thicke feat. T.I. & Pharrell Williams', year: 2013 },
    { title: 'Auf uns', artist: 'Andreas Bourani', year: 2014 },
    { title: 'All About That Bass', artist: 'Meghan Trainor', year: 2014 },
    { title: '7 Years', artist: 'Lukas Graham', year: 2015 },
    { title: 'Lean On (feat. MØ)', artist: 'Major Lazer & DJ Snake', year: 2015 },
    { title: 'Cheap Thrills', artist: 'Sia', year: 2015 },
    { title: 'Scars To Your Beautiful', artist: 'Alessia Cara', year: 2016 },
    { title: '80 Millionen', artist: 'Max Giesinger', year: 2016 },
    { title: 'Without You (feat. Sandro Cavazza)', artist: 'Avicii, Sandro Cavazza', year: 2017 },
    { title: 'Thunder', artist: 'Imagine Dragons', year: 2017 },
    { title: 'Feel It Still', artist: 'Portugal. The Man', year: 2017 },
    { title: 'La Cintura', artist: 'Alvaro Soler', year: 2018 },
    { title: 'Shallow', artist: 'Lady Gaga, Bradley Cooper', year: 2018 },
    { title: 'Someone You Loved', artist: 'Lewis Capaldi', year: 2018 },
    { title: 'bad guy', artist: 'Billie Eilish', year: 2019 },
    { title: 'Adore You', artist: 'Harry Styles', year: 2019 },
    { title: 'Don\'t Call Me Up', artist: 'Mabel', year: 2019 },
    { title: 'Circles', artist: 'Post Malone', year: 2019 },
    { title: 'Señorita', artist: 'Shawn Mendes, Camila Cabello', year: 2019 },
    { title: 'Blinding Lights', artist: 'The Weeknd', year: 2019 },
    { title: 'Dance Monkey', artist: 'Tones And I', year: 2019 },
    { title: 'Toosie Slide', artist: 'Drake', year: 2020 },
    { title: 'Break My Heart', artist: 'Dua Lipa', year: 2020 },
    { title: 'Anyone', artist: 'Justin Bieber', year: 2021 },
    { title: 'Drei Uhr Nachts', artist: 'Mark Forster, LEA', year: 2021 },
    { title: 'drivers license', artist: 'Olivia Rodrigo', year: 2021 },
    { title: 'Die guten Zeiten', artist: 'Wincent Weiss, Johannes Oerding', year: 2021 },
  ];

  const AUTH_HOST = 'https://accounts.spotify.com';
  const API_HOST = 'https://api.spotify.com/v1';
  const SDK_SRC = 'https://sdk.scdn.co/spotify-player.js';
  const SCOPES = 'streaming user-read-email user-read-private user-modify-playback-state user-read-playback-state';

  const STORE = {
    clientId: 'hitster.clientId',
    verifier: 'hitster.pkceVerifier',
    token: 'hitster.token',
    pendingSetup: 'hitster.pendingSetup',
  };

  /** Fold to a shape that survives typos, casing, punctuation and umlauts. */
  const normalize = (value) =>
    String(value)
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/\(.*?\)|\[.*?\]/g, ' ') // "(Remastered)", "[Live]" ...
      .replace(/&/g, ' and ')
      .replace(/[^a-z0-9\s]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .replace(/^the\s+/, '');

  const levenshtein = (a, b) => {
    if (a === b) return 0;
    if (!a.length) return b.length;
    if (!b.length) return a.length;
    let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
    for (let i = 1; i <= a.length; i++) {
      const curr = [i];
      for (let j = 1; j <= b.length; j++) {
        const cost = a[i - 1] === b[j - 1] ? 0 : 1;
        curr[j] = Math.min(curr[j - 1] + 1, prev[j] + 1, prev[j - 1] + cost);
      }
      prev = curr;
    }
    return prev[b.length];
  };

  /**
   * Typo tolerance scaled to the length of the expected answer. Practice mode
   * lets the player pick how forgiving that is; the game itself stays on
   * 'normal', which is what the numbers below were tuned for.
   */
  const TOLERANCE = {
    strict: () => 0,
    normal: (len) => (len >= 12 ? 3 : len >= 8 ? 2 : len >= 5 ? 1 : 0),
    loose: (len) => (len >= 12 ? 5 : len >= 8 ? 3 : len >= 5 ? 2 : 1),
  };

  const isCloseEnough = (guess, answer, mode) => {
    const g = normalize(guess);
    const a = normalize(answer);
    if (!g || !a) return false;
    if (g === a) return true;
    // Half an answer counts when the player asked for a forgiving check, so
    // "bohemian" passes for "Bohemian Rhapsody".
    if (mode === 'loose' && g.length >= 5 && (a.includes(g) || g.includes(a))) return true;
    const scale = TOLERANCE[mode] || TOLERANCE.normal;
    return levenshtein(g, a) <= scale(a.length);
  };

  /** "Mark Ronson feat. Bruno Mars" also accepts just "Mark Ronson". */
  const artistVariants = (artist) =>
    artist
      .split(/\s+(?:feat\.?|ft\.?|featuring|and|x|vs\.?)\s+|[,&]/i)
      .map((part) => part.trim())
      .filter(Boolean)
      .concat(artist);

  const artistMatches = (guess, artist, mode) =>
    artistVariants(artist).some((variant) => isCloseEnough(guess, variant, mode));

  const shuffle = (items) => {
    const copy = items.slice();
    for (let i = copy.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [copy[i], copy[j]] = [copy[j], copy[i]];
    }
    return copy;
  };

  // --- Auth (Authorization Code + PKCE) -------------------------------------

  const redirectUri = () => window.location.origin + window.location.pathname;

  const base64url = (bytes) =>
    btoa(String.fromCharCode(...new Uint8Array(bytes)))
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');

  const randomVerifier = () => {
    const bytes = new Uint8Array(64);
    crypto.getRandomValues(bytes);
    return base64url(bytes);
  };

  const challengeFor = async (verifier) =>
    base64url(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier)));

  const getClientId = () => localStorage.getItem(STORE.clientId) || '';
  const setClientId = (id) => localStorage.setItem(STORE.clientId, id.trim());

  const readToken = () => {
    try {
      return JSON.parse(localStorage.getItem(STORE.token) || 'null');
    } catch (error) {
      return null;
    }
  };

  const writeToken = (payload) => {
    localStorage.setItem(
      STORE.token,
      JSON.stringify({
        access_token: payload.access_token,
        refresh_token: payload.refresh_token || (readToken() || {}).refresh_token,
        expires_at: Date.now() + (payload.expires_in || 3600) * 1000,
      })
    );
  };

  const postToken = async (params) => {
    const response = await fetch(`${AUTH_HOST}/api/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams(params),
    });
    if (!response.ok) throw new Error(`token request failed (${response.status})`);
    return response.json();
  };

  /** Sends the browser to Spotify's consent screen; the page unloads here. */
  const beginAuth = async () => {
    const clientId = getClientId();
    const verifier = randomVerifier();
    sessionStorage.setItem(STORE.verifier, verifier);
    const params = new URLSearchParams({
      client_id: clientId,
      response_type: 'code',
      redirect_uri: redirectUri(),
      code_challenge_method: 'S256',
      code_challenge: await challengeFor(verifier),
      scope: SCOPES,
    });
    window.location.assign(`${AUTH_HOST}/authorize?${params}`);
  };

  const isAuthCallback = () => new URLSearchParams(window.location.search).has('code');

  const completeAuthCallback = async () => {
    const query = new URLSearchParams(window.location.search);
    const code = query.get('code');
    const verifier = sessionStorage.getItem(STORE.verifier);
    // Strip the code from the address bar either way so a reload cannot replay it.
    window.history.replaceState({}, document.title, redirectUri());
    sessionStorage.removeItem(STORE.verifier);
    if (!code || !verifier) return { ok: false, error: 'missing authorization code' };
    try {
      writeToken(
        await postToken({
          grant_type: 'authorization_code',
          code,
          redirect_uri: redirectUri(),
          client_id: getClientId(),
          code_verifier: verifier,
        })
      );
      return { ok: true };
    } catch (error) {
      return { ok: false, error: error.message };
    }
  };

  const validAccessToken = async () => {
    const token = readToken();
    if (!token) return null;
    if (Date.now() < token.expires_at - 60000) return token.access_token;
    if (!token.refresh_token) return null;
    try {
      const refreshed = await postToken({
        grant_type: 'refresh_token',
        refresh_token: token.refresh_token,
        client_id: getClientId(),
      });
      writeToken(refreshed);
      return refreshed.access_token;
    } catch (error) {
      localStorage.removeItem(STORE.token);
      return null;
    }
  };

  // --- Playback -------------------------------------------------------------

  let sdkPromise = null;
  const loadSdk = () => {
    if (sdkPromise) return sdkPromise;
    sdkPromise = new Promise((resolve, reject) => {
      if (window.Spotify) return resolve();
      window.onSpotifyWebPlaybackSDKReady = resolve;
      const script = document.createElement('script');
      script.src = SDK_SRC;
      script.onerror = () => reject(new Error('could not load the Spotify SDK'));
      document.head.appendChild(script);
    });
    return sdkPromise;
  };

  /** Connects a player and resolves once Spotify hands us a device id. */
  const createPlayer = async (onFatal) => {
    await loadSdk();
    const player = new window.Spotify.Player({
      name: 'hitster terminal',
      volume: 0.7,
      getOAuthToken: (cb) => {
        validAccessToken().then((token) => token && cb(token));
      },
    });
    ['initialization_error', 'authentication_error', 'account_error', 'playback_error'].forEach(
      (event) => player.addListener(event, ({ message }) => onFatal(event, message))
    );
    const deviceId = await new Promise((resolve, reject) => {
      player.addListener('ready', ({ device_id }) => resolve(device_id));
      player.connect().then((ok) => {
        if (!ok) reject(new Error('the Spotify player refused to connect'));
      });
      setTimeout(() => reject(new Error('the Spotify player timed out')), 15000);
    });
    // The SDK reconnects on its own (sleep, network blip, token refresh) and
    // announces a brand new device id when it does. Playing to the id we were
    // first handed would 404 from then on, so keep the handle up to date.
    const handle = { player, deviceId };
    player.addListener('ready', ({ device_id }) => {
      handle.deviceId = device_id;
    });
    return handle;
  };

  const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  /** Hands playback to our own device, so the play call has somewhere to go. */
  const transferTo = (deviceId) =>
    api('/me/player', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ device_ids: [deviceId], play: false }),
    });

  /**
   * Starts one track on our device.
   *
   * Spotify answers 404 ("Device not found") while its backend has not caught
   * up with the device the SDK just announced, which it routinely has not in
   * the second after 'ready'. That is a wait-and-retry, not a real failure, so
   * nudge it with a transfer and try again before giving up.
   */
  const playTrack = async (deviceId, uri, positionMs = 0) => {
    const request = {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ uris: [uri], position_ms: positionMs || 0 }),
    };
    let last = 0;
    for (let attempt = 0; attempt < 4; attempt++) {
      const response = await api(`/me/player/play?device_id=${deviceId}`, request);
      if (response.ok) return;
      last = response.status;
      if (last !== 404 && last !== 202) break; // 202: accepted, not ready yet
      await transferTo(deviceId).catch(() => {});
      await wait(400 * (attempt + 1));
    }
    if (last === 404) {
      throw new Error('Spotify never picked up this browser as a playback device');
    }
    if (last === 403) {
      throw new Error('Spotify rejected playback (a Premium account is required)');
    }
    if (last === 401) {
      throw new Error('the Spotify session expired');
    }
    throw new Error(`Spotify refused to play (${last})`);
  };

  const api = async (path, options = {}) => {
    const token = await validAccessToken();
    if (!token) throw new Error('not authenticated');
    return fetch(`${API_HOST}${path}`, {
      ...options,
      headers: { ...(options.headers || {}), Authorization: `Bearer ${token}` },
    });
  };

  /**
   * Resolves a curated entry to a playable Spotify track, or null if the
   * catalogue here has no match. The duration comes along because practice
   * mode needs it to pick a random starting point inside the track.
   */
  const findTrack = async (song) => {
    const query = encodeURIComponent(`track:${song.title} artist:${song.artist}`);
    try {
      const response = await api(`/search?q=${query}&type=track&limit=8`);
      if (!response.ok) return null;
      const items = ((await response.json()).tracks || {}).items || [];
      const hit = items.find((track) =>
        (track.artists || []).some((a) => artistMatches(a.name, song.artist))
      );
      return hit ? { uri: hit.uri, durationMs: hit.duration_ms || 0 } : null;
    } catch (error) {
      return null;
    }
  };

  const findTrackUri = async (song) => {
    const track = await findTrack(song);
    return track ? track.uri : null;
  };

  // --- Public surface -------------------------------------------------------

  window.Hitster = {
    SONGS,
    // audio
    createPlayer,
    playTrack,
    findTrack,
    findTrackUri,
    api,
    // answer matching
    isCloseEnough,
    artistMatches,
    shuffle,
    // auth
    getClientId,
    setClientId,
    beginAuth,
    isAuthCallback,
    completeAuthCallback,
    hasToken: () => Boolean(readToken()),
    logout: () => {
      localStorage.removeItem(STORE.token);
      localStorage.removeItem(STORE.pendingSetup);
    },
    /** Setup config parked across the OAuth redirect. */
    stashSetup: (setup) => localStorage.setItem(STORE.pendingSetup, JSON.stringify(setup)),
    consumeSetup: () => {
      const raw = localStorage.getItem(STORE.pendingSetup);
      localStorage.removeItem(STORE.pendingSetup);
      try {
        return raw ? JSON.parse(raw) : null;
      } catch (error) {
        return null;
      }
    },
  };
})();
