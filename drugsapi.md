Dokumentacja techniczna API leków i refundacji
Produkcyjny adres API: https://drugsapi.miniporadnia.pl
Wymagany nagłówek dla endpointów /v1/*: X-API-Key.
Limity miesięczne odnawiają się 1 dnia miesiąca (Europe/Warsaw).

Nagłówki
Dla endpointów /v1/* wymagany jest nagłówek X-API-Key. Odpowiedzi API zwracają również informacyjne nagłówki o limitach RPS i limitach miesięcznych.

X-API-Key: TWÓJ_KLUCZ
Accept: application/json
Nagłówki zwracane w odpowiedziach:

X-RateLimit-RPS-Limit
X-RateLimit-RPS-Remaining
X-RateLimit-RPS-Reset
X-RateLimit-Requests-Limit
X-RateLimit-Requests-Remaining
X-RateLimit-Records-Limit
X-RateLimit-Records-Remaining
X-RateLimit-Monthly-Reset
Retry-After   (przy HTTP 429)
Nagłówki X-RateLimit-RPS-* dotyczą limitu zapytań na sekundę, a X-RateLimit-Requests-* i X-RateLimit-Records-* dotyczą miesięcznego usage dla bieżącego okresu rozliczeniowego (reset 1 dnia miesiąca, strefa Europe/Warsaw).

Przykład nagłówków odpowiedzi
Przykładowa odpowiedź może zawierać poniższe nagłówki informujące o aktualnych limitach:

HTTP/1.1 200 OK
Content-Type: application/json

X-RateLimit-RPS-Limit: 5
X-RateLimit-RPS-Remaining: 4
X-RateLimit-RPS-Reset: 2026-03-07T21:10:01Z

X-RateLimit-Requests-Limit: 300
X-RateLimit-Requests-Remaining: 259
X-RateLimit-Records-Limit: 5000
X-RateLimit-Records-Remaining: 3079
X-RateLimit-Monthly-Reset: 2026-04-01T00:00:00+02:00
Przy przekroczeniu limitu RPS API zwraca HTTP 429 oraz nagłówek Retry-After z informacją, po ilu sekundach można ponowić próbę.

Endpointy publiczne
GET  /health/db
Endpointy wymagające X-API-Key
GET  /v1/usage
GET  /v1/drugs/{id}
GET  /v1/drugs/by-ean-page/{ean}?page={page}&size={size}
GET  /v1/drugs/by-nazwa-page/{nazwa}?page={page}&size={size}
GET  /v1/drugs/by-subst-page/{subst}?page={page}&size={size}
GET  /v1/drugs/by-atc-page/{atc}?page={page}&size={size}
GET /v1/usage
Zwraca zużycie limitów dla bieżącego miesiąca (Europe/Warsaw) oraz datę resetu.

Endpoint /v1/usage zwraca te same informacje w treści odpowiedzi, które częściowo są również dostępne w nagłówkach HTTP przy zwykłych requestach do API. Dzięki temu integracja może sprawdzać limity zarówno przez dashboard / endpoint usage, jak i bezpośrednio z nagłówków odpowiedzi.

curl -H "X-API-Key: TWÓJ_KLUCZ" \
https://drugsapi.miniporadnia.pl/v1/usage
{
  "requestsUsed": 14,
  "recordsUsed": 295,
  "blocked": 0,
  "requestLimit": 300000,
  "recordLimit": 2000000,
  "planCode": "PRO",
  "validTo": "2027-02-27T12:00:00Z",
  "resetAt": "2026-04-01T00:00:00+02:00"
}
GET /v1/drugs/{id}
Zwraca pełny rekord leku po ID.

curl -H "X-API-Key: TWÓJ_KLUCZ" \
https://drugsapi.miniporadnia.pl/v1/drugs/304628
{
  "id": 304628,
  "nazwa": "Acitren",
  "substCzynna": "Acitretinum",
  "postac": "Kapsułki twarde",
  "dawka": "10 mg",
  "kodAtc": "D05BB02",
  "ean": "05909990907731",
  "rodzajPrep": "ludzki",
  "katDostOpak": "Rp",
  "refund": true,

  "podmOdpow": "Sun-Farm Sp. z o.o.",
  "nrPozw": "18728",
  "waznPozw": "Bezterminowe",

  "wielkoscOpak": "30",
  "jednWielkOpak": "kaps.",
  "zawOpak": "30 kaps.",

  "cenaDetal": 55.64,
  "poziomOdpl": "ryczałt",
  "wysokDopl": 8.90
}
GET /v1/drugs/by-ean-page/{ean}?page={page}&size={size}
Wyszukiwanie leków po EAN z paginacją (8–14 cyfr). page od 0, size od 1 do 100.

curl -H "X-API-Key: TWÓJ_KLUCZ" \
"https://drugsapi.miniporadnia.pl/v1/drugs/by-ean-page/5909991486921?page=0&size=5"
[
  {
    "id": 304628,
    "nazwa": "Acitren",
    "substCzynna": "Acitretinum",
    "postac": "Kapsułki twarde",
    "dawka": "10 mg",
    "ean": "05909990907731",
    "kodAtc": "D05BB02",
    "rodzajPrep": "ludzki",
    "katDostOpak": "Rp",
    "refund": true
  }
]
GET /v1/drugs/by-nazwa-page/{nazwa}?page={page}&size={size}
Wyszukiwanie leków po nazwie z paginacją (3–80 znaków).

curl -H "X-API-Key: TWÓJ_KLUCZ" \
"https://drugsapi.miniporadnia.pl/v1/drugs/by-nazwa-page/Apap?page=0&size=5"
GET /v1/drugs/by-subst-page/{subst}?page={page}&size={size}
Wyszukiwanie leków po substancji czynnej (3–120 znaków).

curl -H "X-API-Key: TWÓJ_KLUCZ" \
"https://drugsapi.miniporadnia.pl/v1/drugs/by-subst-page/paracetamol?page=0&size=5"
GET /v1/drugs/by-atc-page/{atc}?page={page}&size={size}
Lista leków filtrowana po kodzie ATC (3–10 znaków).

curl -H "X-API-Key: TWÓJ_KLUCZ" \
"https://drugsapi.miniporadnia.pl/v1/drugs/by-atc-page/N02BE01?page=0&size=5"
Struktura rekordu skróconego
Endpointy wyszukujące (by-ean, by-nazwa, by-subst, by-atc) zwracają skrócony rekord leku zawierający najważniejsze pola:

id
nazwa
substCzynna
postac
dawka
ean
kodAtc
rodzajPrep
katDostOpak
refund

Dane podstawowe
id – identyfikator rekordu
nazwa – nazwa handlowa
substCzynna – substancja czynna
kodAtc – kod ATC
ean – kod EAN opakowania
rodzajPrep – rodzaj preparatu (np. ludzki / weterynaryjny)
postac – postać farmaceutyczna
dawka – dawka produktu
nazPowStos – nazwa powszechnie stosowana
nazPostDawka – nazwa + postać + dawka
Opakowanie i dostępność
wielkoscOpak – liczba jednostek w opakowaniu
jednWielkOpak – jednostka opakowania (np. tabl., kaps.)
zawOpak – opis zawartości opakowania
katDostOpak – kategoria dostępności (np. OTC, Rp)
opakowaniePojemnoscWartosc – liczność / pojemność opakowania
opakowaniePojemnoscJednostka – jednostka liczności / pojemności
Pozwolenie i rejestracja
podmOdpow – podmiot odpowiedzialny za produkt leczniczy
nrPozw – numer pozwolenia na dopuszczenie do obrotu
waznPozw – ważność pozwolenia
typProc – typ procedury rejestracyjnej
nrEu – numer europejski produktu (jeśli dotyczy)
dystrRown – informacja o dystrybucji równoległej
Refundacja
refund – czy lek jest refundowany
katalog – katalog refundacyjny
terminWejscia – data wejścia decyzji refundacyjnej
okresObowiazDec – okres obowiązywania decyzji
grupaLimit – grupa limitowa refundacji
urzCenaZb – urzędowa cena zbytu
cenaHurtBrut – cena hurtowa brutto
cenaDetal – cena detaliczna
wysokLimitu – wysokość limitu refundacyjnego
poziomOdpl – poziom odpłatności
wysokDopl – dopłata pacjenta
zakrWskazRef – wskazania objęte refundacją
zakrWskazPoza – wskazania pozarejestracyjne objęte refundacją
Metadane techniczne
sysDateCreated – data utworzenia rekordu
sysDateUpdated – data ostatniej aktualizacji
sysUserId – identyfikator użytkownika / systemu
skasowane – status usunięcia rekordu
Pozostałe pola techniczne, takie jak insertDate, updateDate, deleteDate, boxId, są zwykle niewykorzystywane w standardowej integracji.

Jak czytać odpowiedź
Lek nierefundowany zwykle zawiera komplet danych podstawowych, natomiast pola refundacyjne pozostają puste.

Lek refundowany zawiera dodatkowo informacje o decyzji refundacyjnej, cenach urzędowych, grupie limitowej oraz poziomie odpłatności pacjenta.

FAQ – DrugsAPI
Jak uzyskać klucz API?
Najprościej zacząć od planu FREE. Wystarczy podać adres e-mail, a wyślemy klucz API ważny przez 30 dni.

Czy API obsługuje wyszukiwanie po EAN?
Tak. Możesz wyszukiwać leki po EAN, również w endpointach z paginacją.

Czy mogę wyszukiwać po kodzie ATC i substancji czynnej?
Tak. DrugsAPI obsługuje wyszukiwanie po kodzie ATC, substancji czynnej, a także po nazwie leku i EAN.

Czy dostępny jest dashboard zużycia limitów?
Tak. Endpoint /v1/usage oraz dashboard na stronie pokazują aktualny plan, ważność klucza i wykorzystanie limitów.

Dla kogo jest to API?
Dla producentów oprogramowania, systemów gabinetowych, HIS, aptek, hurtowni, integratorów ERP oraz firm, które potrzebują dostępu do polskiej bazy leków i refundacji przez HTTP.

Błędy i limity
200 – OK (poprawna odpowiedź)
400 – niepoprawne parametry zapytania
401 – brak lub niepoprawny klucz API (lub klucz po terminie valid_to)
429 – przekroczony limit (RPS lub miesięczny)
500 – błąd wewnętrzny serwera
502 – błąd upstream
Limity miesięczne odnawiają się 1 dnia miesiąca (strefa Europe/Warsaw).

Przy odpowiedziach 429 API może zwrócić nagłówek Retry-After. Dodatkowo w odpowiedziach zwracane są nagłówki X-RateLimit-RPS-*, X-RateLimit-Requests-* oraz X-RateLimit-Records-*, które pozwalają programistycznie monitorować pozostały limit bez wykonywania osobnego requestu do /v1/usage.