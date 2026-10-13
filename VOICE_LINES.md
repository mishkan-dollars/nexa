# VOICE_LINES — что нужно озвучить

Файл собран скриптом `node tools/extract-voice.js` из исходников игры (перезапускай после правок текстов).

**Итого:** 120 реплик (120 уникальных текстов, ≈6507 символов на один язык). Основной язык — русский (это исходный текст); EN/DE уже переведены в игре, их можно озвучить теми же голосами (модель ElevenLabs Multilingual v2).

Сейчас реплики показываются только субтитрами (`r.say`). Имя в колонке «Файл» — предлагаемое имя озвучки: `assets/voice/<имя>.mp3` (потом подключу воспроизведение по этой таблице — скажи, когда файлы будут в папке).

## Голоса

| Персонаж | Реплик | Описание голоса |
|---|---|---|
| HANDLER | 43 | Куратор / связной в наушнике: мужской, 35–45 лет, спокойный, сухой, чуть уставший; слышен лёгкий радиошум. Единственный «живой» голос игрока. |
| SYSTEM | 40 | Система NEXA: женский или обезличенный, ровный, без эмоций, как автоинформатор 1992 года; слегка металлический. |
| SUBJECT 024 | 15 | Субъект 024: тихий, пугающе спокойный, почти шёпот; нечеловечески ровная интонация. Главный «жуткий» голос игры. |
| INSTRUCTOR | 7 | Инструктор: мужской, сухой военный тон, короткие фразы (миссия 8). |
| OPERATOR | 6 | Оператор: мужской, низкий, холодный (финал, миссия 16). |
| ANNOUNCER | 4 | Диктор арены: громкий, театральный, как ведущий шоу (миссия 13). |
| NARRATOR | 3 | Диктор: тихий, без эмоций — читает найденные документы (миссия 4). |
| ЗАПИСЬ | 1 | Голос записи: плохое качество, как плёнка / диктофон. |
| UNKNOWN PROCESS | 1 | Неизвестный процесс: тот же голос 024, но пропущенный через глитч/питч-даун; можно озвучить тем же голосом и обработать эффектом. |

Порядок генерации: сначала HANDLER и SYSTEM (их больше всего), потом SUBJECT 024 (самое важное по атмосфере), потом редкие голоса.

## Реплики по миссиям


### 01 — CALIBRATION

| Файл | Кто | Русский (озвучивать) | English | Deutsch |
|---|---|---|---|---|
| m01_01 | SYSTEM | СУБЪЕКТ 083 ЗАРЕГИСТРИРОВАН. НАЧАЛО КАЛИБРОВКИ. | SUBJECT 083 REGISTERED. BEGINNING CALIBRATION. | PROBAND 083 REGISTRIERT. KALIBRIERUNG BEGINNT. |
| m01_02 | SUBJECT 024 | Субъект 083. Не торопитесь. | Subject 083. Take your time. | Proband 083. Keine Eile. |
| m01_03 | SUBJECT 024 | Терминал калибровки находится в конце комнаты. | The calibration terminal is at the far end of the room. | Das Kalibrierungsterminal befindet sich am Ende des Raums. |
| m01_04 | SYSTEM | КАЛИБРОВКА: СМОТРИТЕ НА КАЖДУЮ МЕТКУ. | CALIBRATION: LOOK AT EACH MARKER. | KALIBRIERUNG: SIEH JEDEN MARKER AN. |
| m01_05 | SUBJECT 024 | Калибровка завершена. | Calibration complete. | Kalibrierung abgeschlossen. |
| m01_06 | SUBJECT 024 | Ты можешь возвращаться. | You may return. | Du kannst zurückkehren. |

### 02 — OBSERVATION

| Файл | Кто | Русский (озвучивать) | English | Deutsch |
|---|---|---|---|---|
| m02_01 | SYSTEM | СУБЪЕКТ 024 В ЗОНЕ НАБЛЮДЕНИЯ. | SUBJECT 024 IN THE OBSERVATION ZONE. | PROBAND 024 IM BEOBACHTUNGSBEREICH. |
| m02_02 | SYSTEM | НАБЛЮДЕНИЕ ЗА СУБЪЕКТОМ 024. НАЧНИТЕ ЗАПИСЬ НА КОНСОЛИ. | OBSERVING SUBJECT 024. START RECORDING AT THE CONSOLE. | BEOBACHTUNG VON PROBAND 024. STARTE DIE AUFZEICHNUNG AN DER KONSOLE. |
| m02_03 | SUBJECT 024 | Ты записываешь меня. | You are recording me. | Du zeichnest mich auf. |
| m02_04 | SUBJECT 024 | Но кто записывает тебя? | But who is recording you? | Aber wer zeichnet dich auf? |

### 03 — DEVIATION

| Файл | Кто | Русский (озвучивать) | English | Deutsch |
|---|---|---|---|---|
| m03_01 | SYSTEM | ОБНАРУЖЕНО ОТКЛОНЕНИЕ. | DEVIATION DETECTED. | ABWEICHUNG ERKANNT. |
| m03_02 | SYSTEM | ОБНАРУЖЕНО ОТКЛОНЕНИЕ. ДЕТЕКТОР АКТИВЕН. | DEVIATION DETECTED. DETECTOR ACTIVE. | ABWEICHUNG ERKANNT. DETEKTOR AKTIV. |
| m03_03 | SYSTEM | ПОКАЗАНИЯ НЕСТАБИЛЬНЫ. | READINGS UNSTABLE. | MESSWERTE INSTABIL. |
| m03_04 | SUBJECT 024 | Отклонение — это не место. | The deviation is not a place. | Die Abweichung ist kein Ort. |
| m03_05 | SUBJECT 024 | Отклонение — это ты. | The deviation is you. | Die Abweichung bist du. |

### 04 — INCIDENT 1103

| Файл | Кто | Русский (озвучивать) | English | Deutsch |
|---|---|---|---|---|
| m04_01 | SYSTEM | ДОСТУП К ЗАКРЫТОМУ ОБЪЕКТУ. ПИТАНИЕ ОТКЛЮЧЕНО. | ACCESSING RESTRICTED FACILITY. POWER OFFLINE. | ZUGANG ZUR GESPERRTEN ANLAGE. STROM AUSGEFALLEN. |
| m04_02 | SYSTEM | ДОСТУП К ЗАКРЫТОМУ ОБЪЕКТУ. ПИТАНИЕ ОТКЛЮЧЕНО. ФОНАРЬ АКТИВЕН. | ACCESSING RESTRICTED FACILITY. POWER OFFLINE. FLASHLIGHT ACTIVE. | ZUGANG ZUR GESPERRTEN ANLAGE. STROM AUSGEFALLEN. TASCHENLAMPE AKTIV. |
| m04_03 | ЗАПИСЬ | ОНИ ВСЁ ЕЩЁ ЗДЕСЬ. | THEY ARE STILL HERE. | SIE SIND IMMER NOCH HIER. |
| m04_04 | NARRATOR | INCIDENT REPORT 1103. 03.11.1992. ЭКСПЕРИМЕНТ 01 ПРЕРВАН В ТРЕТЬЕМ РАУНДЕ. | INCIDENT REPORT 1103. 03.11.1992. EXPERIMENT 01 ABORTED IN THE THIRD ROUND. | VORFALLSBERICHT 1103. 03.11.1992. EXPERIMENT 01 IN DER DRITTEN RUNDE ABGEBROCHEN. |
| m04_05 | NARRATOR | СУБЪЕКТ 024 НАЗВАЛ ЧИСЛО, КОТОРОЕ НИКТО НЕ ЗАГАДЫВАЛ. | SUBJECT 024 NAMED A NUMBER THAT NOBODY HAD CHOSEN. | PROBAND 024 NANNTE EINE ZAHL, DIE NIEMAND GEWÄHLT HATTE. |
| m04_06 | NARRATOR | ВСЕ СУБЪЕКТЫ ОСТАЛИСЬ В КОМНАТЕ. СУБЪЕКТ 083 ПОКИНУЛ ЕЁ. ЗАПИСЬ ПОВРЕЖДЕНА. | ALL SUBJECTS REMAINED IN THE ROOM. SUBJECT 083 LEFT IT. RECORDING DAMAGED. | ALLE PROBANDEN BLIEBEN IM RAUM. PROBAND 083 VERLIESS IHN. AUFZEICHNUNG BESCHÄDIGT. |

### 05 — UNKNOWN PROCESS

| Файл | Кто | Русский (озвучивать) | English | Deutsch |
|---|---|---|---|---|
| m05_01 | SYSTEM | НЕ ОТВОДИТЕ ОТ НЕГО ВЗГЛЯД. | DO NOT TAKE YOUR EYES OFF IT. | LASS IHN NICHT AUS DEN AUGEN. |
| m05_02 | SYSTEM | ОБНАРУЖЕН НЕИЗВЕСТНЫЙ ПРОЦЕСС. НЕ ОТВОДИТЕ ОТ НЕГО ВЗГЛЯД. | UNKNOWN PROCESS DETECTED. DO NOT TAKE YOUR EYES OFF IT. | UNBEKANNTER PROZESS ERKANNT. LASS IHN NICHT AUS DEN AUGEN. |
| m05_03 | UNKNOWN PROCESS | Ты не завершил меня. Ты меня вызвал. | You did not terminate me. You summoned me. | Du hast mich nicht beendet. Du hast mich gerufen. |

### 06 — FINAL EXPERIMENT

| Файл | Кто | Русский (озвучивать) | English | Deutsch |
|---|---|---|---|---|
| m06_01 | SYSTEM | ФИНАЛЬНЫЙ ЭКСПЕРИМЕНТ. СУБЪЕКТ 083. | FINAL EXPERIMENT. SUBJECT 083. | LETZTES EXPERIMENT. PROBAND 083. |
| m06_02 | SUBJECT 024 | Я загадал число от одного до семи. | I have chosen a number from one to seven. | Ich habe mir eine Zahl von eins bis sieben ausgedacht. |
| m06_03 | SUBJECT 024 | Подойди к числу. Я скажу HIGH или LOW. | Walk up to a number. I will say HIGH or LOW. | Geh zu einer Zahl. Ich sage HIGH oder LOW. |
| m06_04 | SUBJECT 024 | CORRECT. | CORRECT. | RICHTIG. |
| m06_05 | SUBJECT 024 | Ты нашёл число. | You found the number. | Du hast die Zahl gefunden. |
| m06_06 | SUBJECT 024 | А я всё это время искал тебя. | And all this time I was looking for you. | Und die ganze Zeit habe ich dich gesucht. |
| m06_07 | SUBJECT 024 | HIGH. Число больше. | HIGH. The number is higher. | HIGH. Die Zahl ist höher. |
| m06_08 | SUBJECT 024 | LOW. Число меньше. | LOW. The number is lower. | LOW. Die Zahl ist niedriger. |

### 07 — BREAKOUT

| Файл | Кто | Русский (озвучивать) | English | Deutsch |
|---|---|---|---|---|
| m07_01 | SYSTEM | ВСЕ ТЕСТЫ ПРОЙДЕНЫ. СУБЪЕКТ 083 ПЕРЕВОДИТСЯ НА СОДЕРЖАНИЕ. | ALL TESTS PASSED. SUBJECT 083 IS BEING MOVED TO DETENTION. | ALLE TESTS BESTANDEN. PROBAND 083 WIRD IN GEWAHRSAM ÜBERFÜHRT. |
| m07_02 | SYSTEM | ПЕРИМЕТР НАРУШЕН. БЛОК C ЗАПЕЧАТАН. | PERIMETER BREACHED. BLOCK C SEALED. | PERIMETER VERLETZT. BLOCK C VERSIEGELT. |
| m07_03 | SYSTEM | КАРАНТИННАЯ ПЕРЕБОРКА ЗАКРЫВАЕТСЯ. | QUARANTINE BULKHEAD CLOSING. | QUARANTÄNESCHOTT SCHLIESST SICH. |

### 08 — PROFICIENCY TEST

| Файл | Кто | Русский (озвучивать) | English | Deutsch |
|---|---|---|---|---|
| m08_01 | INSTRUCTOR | СУБЪЕКТ 083. ПОЛИГОН. ВАША ЗАДАЧА — ТОЧНОСТЬ. | SUBJECT 083. SHOOTING RANGE. YOUR TASK IS ACCURACY. | PROBAND 083. SCHIESSSTAND. IHRE AUFGABE IST PRÄZISION. |
| m08_02 | INSTRUCTOR | Субъект 083. Оружие на стойке. Берите. | Subject 083. The weapon is on the counter. Take it. | Proband 083. Die Waffe liegt auf dem Tresen. Nimm sie. |
| m08_03 | INSTRUCTOR | Ещё раз. Не торопитесь. | Again. Take your time. | Noch einmal. Keine Eile. |
| m08_04 | INSTRUCTOR | Бейте только чёрные. Белый жилет — свои. | Hit only the black ones. White vest — friendly. | Triff nur die schwarzen. Weisse Weste — Verbündete. |
| m08_05 | INSTRUCTOR | Теперь они движутся. Время пошло. | Now they move. The clock is running. | Jetzt bewegen sie sich. Die Zeit läuft. |
| m08_06 | INSTRUCTOR | Последний этап. Мишени стреляют. Берите АК. | Final stage. The targets shoot back. Take the AK. | Letzte Stufe. Die Ziele schiessen zurück. Nimm die AK. |
| m08_07 | INSTRUCTOR | Тест пройден. Субъект 083 допущен. | Test passed. Subject 083 cleared. | Test bestanden. Proband 083 zugelassen. |

### 09 — POWER SURGE

| Файл | Кто | Русский (озвучивать) | English | Deutsch |
|---|---|---|---|---|
| m09_01 | SYSTEM | РЕАКТОР НЕСТАБИЛЕН. ВОЗМОЖНЫ ПЕРЕГРУЗКИ. | REACTOR UNSTABLE. OVERLOADS POSSIBLE. | REAKTOR INSTABIL. ÜBERLASTUNGEN MÖGLICH. |
| m09_02 | SYSTEM | ПИТАНИЕ ВОССТАНОВЛЕНО. | POWER RESTORED. | STROM WIEDERHERGESTELLT. |
| m09_03 | SYSTEM | РЕАКТОРНОЕ КРЫЛО ОБЕСТОЧЕНО. ЗАПУСТИТЕ ТРИ ГЕНЕРАТОРА. | REACTOR WING POWERED DOWN. START THREE GENERATORS. | REAKTORFLÜGEL OHNE STROM. STARTE DREI GENERATOREN. |
| m09_04 | SYSTEM | ГЕНЕРАТОР 1 ЗАПУЩЕН. СЛЕДУЮЩИЙ — ПО МАРКЕРУ. | GENERATOR 1 STARTED. NEXT ONE — FOLLOW THE MARKER. | GENERATOR 1 GESTARTET. DER NÄCHSTE — FOLGE DEM MARKER. |
| m09_05 | SYSTEM | ГЕНЕРАТОР 2 ЗАПУЩЕН. СЛЕДУЮЩИЙ — ПО МАРКЕРУ. | GENERATOR 2 STARTED. NEXT ONE — FOLLOW THE MARKER. | GENERATOR 2 GESTARTET. DER NÄCHSTE — FOLGE DEM MARKER. |

### 10 — LIFT SHAFT

| Файл | Кто | Русский (озвучивать) | English | Deutsch |
|---|---|---|---|---|
| m10_01 | SYSTEM | ПОДЪЁМ НА ПОВЕРХНОСТЬ. НЕ ДАЙТЕ ИМ ПОДОБРАТЬСЯ. | ASCENDING TO THE SURFACE. DO NOT LET THEM GET CLOSE. | AUFSTIEG ZUR OBERFLÄCHE. LASS SIE NICHT NÄHERKOMMEN. |
| m10_02 | SYSTEM | ПОДЪЁМ НА ПОВЕРХНОСТЬ. ДЕРЖИТЕ ПЛАТФОРМУ. | ASCENDING TO THE SURFACE. HOLD THE PLATFORM. | AUFSTIEG ZUR OBERFLÄCHE. HALTE DIE PLATTFORM. |
| m10_03 | SYSTEM | ДОСТАВЛЕН АК-47. ЗАБЕРИТЕ. | AK-47 DELIVERED. PICK IT UP. | AK-47 GELIEFERT. NIMM SIE AUF. |

### 11 — BLACKOUT

| Файл | Кто | Русский (озвучивать) | English | Deutsch |
|---|---|---|---|---|
| m11_01 | SYSTEM | ПИТАНИЕ ОТКЛЮЧЕНО. ВОССТАНОВИТЕ ТРИ ПРЕДОХРАНИТЕЛЯ. | POWER OFF. RESTORE THREE FUSES. | STROM AUSGEFALLEN. STELLE DREI SICHERUNGEN WIEDER HER. |
| m11_02 | SYSTEM | ПИТАНИЕ ОТКЛЮЧЕНО. НАЙДИТЕ ТРИ ПРЕДОХРАНИТЕЛЯ. | POWER OFF. FIND THREE FUSES. | STROM AUSGEFALLEN. FINDE DREI SICHERUNGEN. |
| m11_03 | SYSTEM | ОНО ДВИЖЕТСЯ, КОГДА ВЫ НЕ СМОТРИТЕ. | IT MOVES WHEN YOU ARE NOT LOOKING. | ES BEWEGT SICH, WENN DU NICHT HINSIEHST. |
| m11_04 | SYSTEM | ЧАСТИЧНОЕ ПИТАНИЕ. СЛЕДУЮЩИЙ ПРЕДОХРАНИТЕЛЬ. | PARTIAL POWER. NEXT FUSE. | TEILWEISE STROM. NÄCHSTE SICHERUNG. |
| m11_05 | SYSTEM | ПИТАНИЕ ВОССТАНОВЛЕНО. ОХРАНА ПЕРЕБРАСЫВАЕТСЯ. | POWER RESTORED. GUARDS ARE BEING REDEPLOYED. | STROM WIEDERHERGESTELLT. WACHEN WERDEN VERLEGT. |

### 12 — NIGHT TRAIN

| Файл | Кто | Русский (озвучивать) | English | Deutsch |
|---|---|---|---|---|
| m12_01 | SYSTEM | СОСТАВ 12. ПЕРЕВОЗКА СУБЪЕКТА 083. ПОСТОРОННИХ НЕТ. | TRAIN 12. TRANSPORTING SUBJECT 083. NO UNAUTHORIZED PERSONS ABOARD. | ZUG 12. TRANSPORT VON PROBAND 083. KEINE UNBEFUGTEN AN BORD. |
| m12_02 | SYSTEM | ПОЕЗД ОСТАНОВЛЕН. | TRAIN STOPPED. | ZUG ANGEHALTEN. |
| m12_03 | SYSTEM | ПОЕЗД 083. НОЧНОЙ РЕЙС. ПРОБЕЙТЕСЬ К ЛОКОМОТИВУ. | TRAIN 083. NIGHT SERVICE. FIGHT YOUR WAY TO THE LOCOMOTIVE. | ZUG 083. NACHTFAHRT. KÄMPFE DICH ZUR LOKOMOTIVE DURCH. |
| m12_04 | SYSTEM | ТУННЕЛЬ. ОСВЕЩЕНИЕ ОТКЛЮЧЕНО. | TUNNEL. LIGHTS OFF. | TUNNEL. BELEUCHTUNG AUS. |
| m12_05 | SYSTEM | ОНИ ВРЫВАЮТСЯ ЧЕРЕЗ ОКНА. | THEY ARE BREAKING IN THROUGH THE WINDOWS. | SIE BRECHEN DURCH DIE FENSTER EIN. |

### 13 — OPEN FIRE

| Файл | Кто | Русский (озвучивать) | English | Deutsch |
|---|---|---|---|---|
| m13_01 | ANNOUNCER | ВНИМАНИЕ. АРЕНА ОТКРЫТА. СУБЪЕКТ 083 ВЫХОДИТ НА ПЛОЩАДКУ. | ATTENTION. THE ARENA IS OPEN. SUBJECT 083 ENTERS THE FLOOR. | ACHTUNG. DIE ARENA IST GEÖFFNET. PROBAND 083 BETRITT DIE FLÄCHE. |
| m13_02 | ANNOUNCER | ДОБРО ПОЖАЛОВАТЬ НА АРЕНУ. ПЯТЬ РАУНДОВ. ВЫЖИВИТЕ. | WELCOME TO THE ARENA. FIVE ROUNDS. SURVIVE. | WILLKOMMEN IN DER ARENA. FÜNF RUNDEN. ÜBERLEBE. |
| m13_03 | ANNOUNCER | ФИНАЛЬНЫЙ РАУНД. ВЫХОДИТ СМОТРИТЕЛЬ. | FINAL ROUND. THE WARDEN ENTERS. | LETZTE RUNDE. DER AUFSEHER BETRITT DIE ARENA. |
| m13_04 | ANNOUNCER | СМОТРИТЕЛЬ ПАЛ. АРЕНА ЗАКРЫТА. | THE WARDEN HAS FALLEN. ARENA CLOSED. | DER AUFSEHER IST GEFALLEN. ARENA GESCHLOSSEN. |

### 14 — CLOSE QUARTERS

| Файл | Кто | Русский (озвучивать) | English | Deutsch |
|---|---|---|---|---|
| m14_01 | SYSTEM | ПЯТЬ КОМНАТ. ЗАЧИСТИТЬ БЫСТРО. ЗАЛОЖНИКОВ НЕ ТРОГАТЬ. | FIVE ROOMS. CLEAR THEM FAST. DO NOT TOUCH THE HOSTAGES. | FÜNF RÄUME. SCHNELL SÄUBERN. GEISELN NICHT ANRÜHREN. |
| m14_02 | SYSTEM | ЗАЛОЖНИКИ В БЛОКЕ D. БЕЛЫЙ ЖИЛЕТ — НЕ СТРЕЛЯТЬ. | HOSTAGES IN BLOCK D. WHITE VEST — DO NOT SHOOT. | GEISELN IN BLOCK D. WEISSE WESTE — NICHT SCHIESSEN. |
| m14_03 | SYSTEM | КОНТАКТ В КОРИДОРЕ. | CONTACT IN THE CORRIDOR. | KONTAKT IM KORRIDOR. |

### 15 — CONTROL ROOM

| Файл | Кто | Русский (озвучивать) | English | Deutsch |
|---|---|---|---|---|
| m15_01 | SYSTEM | ТЕРМИНАЛ ДОСТУПА — В ГЛУБИНЕ БЛОКА. ОХРАНА НА ОБХОДЕ. | ACCESS TERMINAL IS DEEP IN THE BLOCK. GUARDS ON PATROL. | ZUGANGSTERMINAL TIEF IM BLOCK. WACHEN AUF STREIFE. |
| m15_02 | SYSTEM | ОХРАНА НА ОБХОДЕ. ГЛУШИТЕЛЬ УСТАНОВЛЕН. НЕ ПОПАДАЙТЕСЬ НА ГЛАЗА. | GUARDS ON PATROL. SUPPRESSOR FITTED. STAY OUT OF SIGHT. | WACHEN AUF STREIFE. SCHALLDÄMPFER AUFGESETZT. BLEIB UNENTDECKT. |
| m15_03 | SYSTEM | ДАННЫЕ СКОПИРОВАНЫ. ТРЕВОГА. К ВЫХОДУ. | DATA COPIED. ALARM. TO THE EXIT. | DATEN KOPIERT. ALARM. ZUM AUSGANG. |

### 16 — NEXA PROTOCOL

| Файл | Кто | Русский (озвучивать) | English | Deutsch |
|---|---|---|---|---|
| m16_01 | SYSTEM | ВСЕ ПОДСИСТЕМЫ ОТКЛЮЧЕНЫ. ПРОТОКОЛ NEXA АКТИВЕН. | ALL SUBSYSTEMS OFFLINE. NEXA PROTOCOL ACTIVE. | ALLE SUBSYSTEME ABGESCHALTET. NEXA-PROTOKOLL AKTIV. |
| m16_02 | OPERATOR | ПРОТОКОЛ ЗАВЕРШЁН. ОСТАЛСЯ ОДИН СУБЪЕКТ. | PROTOCOL COMPLETE. ONE SUBJECT REMAINS. | PROTOKOLL ABGESCHLOSSEN. EIN PROBAND VERBLEIBT. |
| m16_03 | OPERATOR | СУБЪЕКТ 084. УСТРАНИТЕ ЕГО — И ЭКСПЕРИМЕНТ ОКОНЧЕН. | SUBJECT 084. ELIMINATE THE SUBJECT — AND THE EXPERIMENT IS OVER. | PROBAND 084. BESEITIGEN SIE DEN PROBANDEN — UND DAS EXPERIMENT IST BEENDET. |
| m16_04 | OPERATOR | ВЫ ВЫПОЛНИЛИ ПРОТОКОЛ. СУБЪЕКТ 083 ПРИНЯТ. | YOU EXECUTED THE PROTOCOL. SUBJECT 083 ACCEPTED. | SIE HABEN DAS PROTOKOLL AUSGEFÜHRT. PROBAND 083 AKZEPTIERT. |
| m16_05 | OPERATOR | ОШИБКА. СУБЪЕКТ 083 НЕ ВЫПОЛНИЛ ПРОТОКОЛ. | ERROR. SUBJECT 083 DID NOT EXECUTE THE PROTOCOL. | FEHLER. PROBAND 083 HAT DAS PROTOKOLL NICHT AUSGEFÜHRT. |
| m16_06 | OPERATOR | ЭТО... НОВЫЙ РЕЗУЛЬТАТ. | THIS... IS A NEW RESULT. | DAS... IST EIN NEUES ERGEBNIS. |
| m16_07 | OPERATOR | СУБЪЕКТ 083. ВЫ ПРОШЛИ ВСЕ ТЕСТЫ. ОСТАЛСЯ ПРОТОКОЛ. | SUBJECT 083. YOU HAVE PASSED ALL TESTS. ONLY THE PROTOCOL REMAINS. | PROBAND 083. SIE HABEN ALLE TESTS BESTANDEN. ES BLEIBT DAS PROTOKOLL. |

### 17 — DAYLIGHT

| Файл | Кто | Русский (озвучивать) | English | Deutsch |
|---|---|---|---|---|
| m17_01 | HANDLER | ДОБРО ПОЖАЛОВАТЬ НАВЕРХ. ТРИ ДИСКА НАШЕГО ПРОЕКТА ВЫНЕСЛИ НА ПЛОЩАДЬ. ВЕРНИ ИХ. ПАТРОНЫ ВОЗЬМИ У ЯЩИКОВ. | WELCOME TOPSIDE. THREE DRIVES FROM OUR PROJECT WERE CARRIED OUT TO THE PLAZA. GET THEM BACK. TAKE AMMO FROM THE CRATES. | WILLKOMMEN AN DER OBERFLÄCHE. DREI LAUFWERKE UNSERES PROJEKTS WURDEN AUF DEN PLATZ GEBRACHT. HOL SIE ZURÜCK. MUNITION FINDEST DU BEI DEN KISTEN. |

### 18 — SAFEHOUSE

| Файл | Кто | Русский (озвучивать) | English | Deutsch |
|---|---|---|---|---|
| m18_01 | HANDLER | ГЕНЕРАТОР ЗАПУЩЕН. ДЕРЖИСЬ — ОНИ УЖЕ ИДУТ. | GENERATOR RUNNING. HOLD ON — THEY ARE ALREADY COMING. | GENERATOR LÄUFT. HALTE DURCH — SIE KOMMEN SCHON. |
| m18_02 | HANDLER | УЛИЦА КИШИТ ЛЮДЬМИ ЗАКАЗЧИКА. ПРОЙДИ ТИХО К УБЕЖИЩУ, ЗАПУСТИ ГЕНЕРАТОР И ДЕРЖИСЬ. ЕСЛИ СПАЛЯТ — СТРЕЛЯЙ. | THE STREET IS CRAWLING WITH THE CLIENT'S PEOPLE. GET TO THE SAFEHOUSE QUIETLY, START THE GENERATOR AND HOLD ON. IF THEY SPOT YOU — SHOOT. | AUF DER STRASSE WIMMELT ES VON DEN LEUTEN DES AUFTRAGGEBERS. SCHLEICH LEISE ZUM UNTERSCHLUPF, STARTE DEN GENERATOR UND HALTE DURCH. WENN SIE DICH ENTDECKEN — SCHIESS. |

### 19 — CLEANERS

| Файл | Кто | Русский (озвучивать) | English | Deutsch |
|---|---|---|---|---|
| m19_01 | HANDLER | ОФИС, ГДЕ ЧИСТЯТ СЛЕДЫ. ВЗЛОМАЙ ТЕРМИНАЛ АРХИВА — НО ОХРАНА УСЛЫШИТ ШУМ. ГОТОВЬСЯ. | AN OFFICE WHERE THEY WIPE OUT THE TRACES. HACK THE ARCHIVE TERMINAL — BUT SECURITY WILL HEAR THE NOISE. BE READY. | EIN BÜRO, IN DEM SPUREN BESEITIGT WERDEN. HACKE DAS ARCHIVTERMINAL — ABER DIE WACHEN WERDEN DEN LÄRM HÖREN. SEI BEREIT. |

### 20 — SCRAPYARD

| Файл | Кто | Русский (озвучивать) | English | Deutsch |
|---|---|---|---|---|
| m20_01 | HANDLER | ВОРОТА ЗАВАРЕНЫ. C4 ЛЕЖИТ У ЯЩИКОВ. ПОСЛЕ ВЗРЫВА ЗА СПИНОЙ ЗАПУСТЯТ ПРЕСС — НЕ ОСТАНАВЛИВАЙСЯ. | THE GATE IS WELDED SHUT. THE C4 IS BY THE CRATES. AFTER THE BLAST THEY WILL START THE COMPACTOR BEHIND YOU — DON'T STOP. | DAS TOR IST ZUGESCHWEISST. DAS C4 LIEGT BEI DEN KISTEN. NACH DER EXPLOSION WIRD HINTER DIR DIE PRESSE ANGEWORFEN — BLEIB NICHT STEHEN. |

### 21 — FIRST JOB

| Файл | Кто | Русский (озвучивать) | English | Deutsch |
|---|---|---|---|---|
| m21_01 | HANDLER | ПЕРВОЕ НАСТОЯЩЕЕ ДЕЛО. СКЛАД В ПОРТУ. ВЗЛОМАЙ ПАНЕЛЬ, ДОСТАНЬ СПИСОК ГРУЗОВ И УХОДИ. ТИХО, ЕСЛИ ПОЛУЧИТСЯ. | THE FIRST REAL JOB. A WAREHOUSE AT THE PORT. HACK THE PANEL, GET THE CARGO LIST AND LEAVE. QUIETLY, IF YOU CAN. | DER ERSTE RICHTIGE JOB. EIN LAGERHAUS IM HAFEN. HACKE DAS PANEL, HOL DIE FRACHTLISTE UND VERSCHWINDE. LEISE, WENN ES GEHT. |

### 22 — LOCKSMITH

| Файл | Кто | Русский (озвучивать) | English | Deutsch |
|---|---|---|---|---|
| m22_01 | HANDLER | ТРИ ЗАМКА, ТРИ ЭТАЖА ОХРАНЫ. КАЖДЫЙ ЗАМОК — ВЗЛОМ. ПОЛКОВНИК ЗАПЛАТИЛ ЗА ТИШИНУ. | THREE LOCKS, THREE FLOORS OF SECURITY. EVERY LOCK IS A HACK. THE COLONEL PAID FOR SILENCE. | DREI SCHLÖSSER, DREI ETAGEN SICHERHEIT. JEDES SCHLOSS MUSS GEHACKT WERDEN. DER OBERST HAT FÜR RUHE BEZAHLT. |

### 23 — CAMERA LOOP

| Файл | Кто | Русский (озвучивать) | English | Deutsch |
|---|---|---|---|---|
| m23_01 | HANDLER | КАМЕРЫ ВИДЯТ ВСЁ. НА КАЖДОМ ЭТАЖЕ ЕСТЬ ПАНЕЛЬ, КОТОРАЯ ПУСКАЕТ ИХ ПО КРУГУ. НАЙДИ ЕЁ РАНЬШЕ, ЧЕМ ОНИ НАЙДУТ ТЕБЯ. | THE CAMERAS SEE EVERYTHING. EVERY FLOOR HAS A PANEL THAT LOOPS THEM. FIND IT BEFORE THEY FIND YOU. | DIE KAMERAS SEHEN ALLES. AUF JEDER ETAGE GIBT ES EIN PANEL, DAS SIE IN EINE SCHLEIFE SCHICKT. FINDE ES, BEVOR SIE DICH FINDEN. |

### 24 — DEAD DROP

| Файл | Кто | Русский (озвучивать) | English | Deutsch |
|---|---|---|---|---|
| m24_01 | HANDLER | ЧЕТЫРЕ ТАЙНИКА ПО СТАНЦИИ. СОБЕРИ ВСЕ. НА ПЕРРОНЕ ТЕБЯ ЖДУТ ПЕРЕКУПЩИКИ. | FOUR DEAD DROPS AROUND THE STATION. COLLECT THEM ALL. RESELLERS ARE WAITING FOR YOU ON THE PLATFORM. | VIER TOTE BRIEFKÄSTEN IM BAHNHOF. SAMMLE SIE ALLE EIN. AUF DEM BAHNSTEIG WARTEN DIE HEHLER AUF DICH. |

### 25 — PARKING LEVEL 3

| Файл | Кто | Русский (озвучивать) | English | Deutsch |
|---|---|---|---|---|
| m25_01 | HANDLER | ПАРКОВКА, МАШИНЫ, ТЕНИ. НА УРОВНЕ ТРИ ЧЕЛОВЕКА С КЛЮЧАМИ. ЗАБЕРИ ИХ И ВЫЙДИ ЧЕРЕЗ ЛЮК. | A PARKING GARAGE, CARS, SHADOWS. THREE PEOPLE ON THE LEVEL HAVE KEYS. TAKE THEM AND LEAVE THROUGH THE HATCH. | PARKHAUS, AUTOS, SCHATTEN. AUF DER EBENE HABEN DREI LEUTE SCHLÜSSEL. NIMM SIE AN DICH UND VERLASSE DAS GEBÄUDE DURCH DIE LUKE. |

### 26 — WIRETAP

| Файл | Кто | Русский (озвучивать) | English | Deutsch |
|---|---|---|---|---|
| m26_01 | HANDLER | НАМ НУЖЕН ТЕЛЕФОН ИХ ГЛАВНОГО. ВЗЛОМАЙ ЛИНИЮ, УДЕРЖИВАЙ ЗВОНОК ДВАДЦАТЬ СЕКУНД. НИКТО НЕ ДОЛЖЕН ТЕБЯ ЗАМЕТИТЬ. | WE NEED THEIR LEADER'S PHONE. HACK THE LINE, KEEP THE CALL OPEN FOR TWENTY SECONDS. NO ONE MUST NOTICE YOU. | WIR BRAUCHEN DAS TELEFON IHRES ANFÜHRERS. HACKE DIE LEITUNG UND HALTE DAS GESPRÄCH ZWANZIG SEKUNDEN OFFEN. NIEMAND DARF DICH BEMERKEN. |

### 27 — HOSTAGE

| Файл | Кто | Русский (озвучивать) | English | Deutsch |
|---|---|---|---|---|
| m27_01 | HANDLER | ТРОЕ ЗАЛОЖНИКОВ. ПОСЛЕ ПЕРВОГО ВЫСТРЕЛА ЧАСЫ ИДУТ. ПЕРЕРЕЖЬ ВЕРЁВКИ И ВЫВОДИ ИХ. ЗАЛОЖНИКОВ С БЕЛЫМИ ЖИЛЕТАМИ НЕ ТРОГАЙ. | THREE HOSTAGES. AFTER THE FIRST SHOT THE CLOCK STARTS. CUT THE ROPES AND GET THEM OUT. DON'T TOUCH THE HOSTAGES IN WHITE VESTS. | DREI GEISELN. NACH DEM ERSTEN SCHUSS LÄUFT DIE UHR. DURCHTRENNE DIE FESSELN UND BRING SIE RAUS. FASS DIE GEISELN IN WEISSEN WESTEN NICHT AN. |

### 28 — DEMOLITION

| Файл | Кто | Русский (озвучивать) | English | Deutsch |
|---|---|---|---|---|
| m28_01 | HANDLER | СНОСИМ ВСЁ ПО ПЛАНУ. СНАЧАЛА ЗАЧИСТКА, ПОТОМ СТЕНА, ПОТОМ ОСНОВНОЙ ЗАРЯД. У ТЕБЯ ЕСТЬ C4 И ГРАНАТЫ. | WE DEMOLISH EVERYTHING ACCORDING TO PLAN. FIRST CLEAR THE AREA, THEN THE WALL, THEN THE MAIN CHARGE. YOU HAVE C4 AND GRENADES. | WIR REISSEN ALLES NACH PLAN AB. ERST SÄUBERN, DANN DIE WAND, DANN DIE HAUPTLADUNG. DU HAST C4 UND GRANATEN. |

### 29 — GAS LEAK

| Файл | Кто | Русский (озвучивать) | English | Deutsch |
|---|---|---|---|---|
| m29_01 | HANDLER | ТРУБЫ ПРОРВАЛО. ГАЗ ПОДНИМАЕТСЯ ВОЛНАМИ — ПРЯЧЬСЯ ЗА УКРЫТИЯМИ. ЗАКРОЙ ВЕНТИЛЬ И УХОДИ. | THE PIPES HAVE BURST. THE GAS RISES IN WAVES — HIDE BEHIND COVER. CLOSE THE VALVE AND LEAVE. | DIE ROHRE SIND GEPLATZT. DAS GAS STEIGT IN WELLEN — GEH HINTER DEN DECKUNGEN IN SICHERHEIT. SCHLIESSE DAS VENTIL UND VERSCHWINDE. |

### 30 — DIVERSION

| Файл | Кто | Русский (озвучивать) | English | Deutsch |
|---|---|---|---|---|
| m30_01 | HANDLER | ПУСТЬ ОНИ БЕГУТ К ВЗРЫВУ. ЗАЛОЖИ ЗАРЯД ДАЛЕКО ОТ ЦЕЛИ, А САМ ИДИ ТИХО ПО КОРИДОРУ. ДРОБОВИК — НА ЯЩИКЕ. | LET THEM RUN TO THE BLAST. PLANT THE CHARGE FAR FROM THE TARGET AND WALK QUIETLY DOWN THE CORRIDOR YOURSELF. THE SHOTGUN IS ON THE CRATE. | SOLLEN SIE ZUR EXPLOSION RENNEN. BRING DIE LADUNG WEIT VOM ZIEL AN UND GEH SELBST LEISE DEN GANG ENTLANG. DIE SCHROTFLINTE LIEGT AUF DER KISTE. |

### 31 — CONVOY

| Файл | Кто | Русский (озвучивать) | English | Deutsch |
|---|---|---|---|---|
| m31_01 | HANDLER | КОЛОННА ИДЁТ ЧЕРЕЗ ПОСТ. ЗАЧИСТИ ПОСТ, ВЗОРВИ ГРУЗОВИК И ЗАБЕРИ КОНТЕЙНЕР. ТЯЖЁЛАЯ ПЕХОТА ЖДЁТ ПОД ПРИКРЫТИЕМ. | THE CONVOY IS COMING THROUGH THE CHECKPOINT. CLEAR THE CHECKPOINT, BLOW UP THE TRUCK AND TAKE THE CONTAINER. HEAVY INFANTRY IS WAITING UNDER COVER. | DER KONVOI KOMMT DURCH DEN KONTROLLPUNKT. SÄUBERE DEN POSTEN, SPRENGE DEN LKW UND NIMM DEN CONTAINER MIT. SCHWERE INFANTERIE WARTET IN DECKUNG. |

### 32 — FLASHBANG

| Файл | Кто | Русский (озвучивать) | English | Deutsch |
|---|---|---|---|---|
| m32_01 | HANDLER | ТЯЖЁЛЫЕ ВНУТРИ — ОНИ ПРОБЬЮТ ТЕБЯ НАСКВОЗЬ. БРОСАЙ СВЕТОШУМОВЫЕ И БЕЙ В ГОЛОВУ. ДРОБОВИК ПОМОЖЕТ. | HEAVIES INSIDE — THEY WILL TEAR RIGHT THROUGH YOU. THROW FLASHBANGS AND HIT THEM IN THE HEAD. THE SHOTGUN WILL HELP. | SCHWERE EINHEITEN DRINNEN — SIE DURCHLÖCHERN DICH. WIRF BLENDGRANATEN UND ZIEL AUF DEN KOPF. DIE SCHROTFLINTE HILFT. |

### 33 — DEMO DERBY

| Файл | Кто | Русский (озвучивать) | English | Deutsch |
|---|---|---|---|---|
| m33_01 | HANDLER | ТОЛПА ЖДЁТ ШОУ. БОЧКИ НА ПОЛЕ ВЗРЫВАЮТСЯ ОТ ЛЮБОЙ ПУЛИ. ВЫЖИВИ — И МЫ ЗАБИРАЕМ ПРИЗ. | THE CROWD WANTS A SHOW. THE BARRELS ON THE FIELD EXPLODE FROM ANY BULLET. SURVIVE — AND WE TAKE THE PRIZE. | DIE MENGE WILL EINE SHOW. DIE FÄSSER AUF DEM FELD EXPLODIEREN BEI JEDEM TREFFER. ÜBERLEBE — UND WIR HOLEN DEN PREIS. |

### 34 — NIGHT SHIFT

| Файл | Кто | Русский (озвучивать) | English | Deutsch |
|---|---|---|---|---|
| m34_01 | HANDLER | СВЕТ ВЫКЛЮЧЕН — ФОНАРЬ ЕСТЬ, НО ОХРАНА СЛЫШИТ ШАГИ. ТИХО ДО ТЕРМИНАЛА, ПОТОМ ВЗЛОМ. | THE LIGHTS ARE OFF — YOU HAVE A FLASHLIGHT, BUT SECURITY HEARS FOOTSTEPS. STAY QUIET TO THE TERMINAL, THEN HACK. | DAS LICHT IST AUS — DU HAST EINE TASCHENLAMPE, ABER DIE WACHEN HÖREN SCHRITTE. LEISE BIS ZUM TERMINAL, DANN HACKEN. |

### 35 — GLASS HOUSE

| Файл | Кто | Русский (озвучивать) | English | Deutsch |
|---|---|---|---|---|
| m35_01 | HANDLER | ДОМ ИЗ СТЕКЛА, ЛУЧИ ПОВСЮДУ, КАМЕРЫ НАД ПОТОЛКОМ. ДВИГАЙСЯ МЕДЛЕННО И ЖДИ ПРОМЕЖУТКОВ МЕЖДУ ВСПЫШКАМИ. | A HOUSE OF GLASS, BEAMS EVERYWHERE, CAMERAS ABOVE THE CEILING. MOVE SLOWLY AND WAIT FOR THE GAPS BETWEEN THE FLASHES. | EIN HAUS AUS GLAS, ÜBERALL STRAHLEN, KAMERAS ÜBER DER DECKE. BEWEGE DICH LANGSAM UND WARTE AUF DIE PAUSEN ZWISCHEN DEN BLITZEN. |

### 36 — THE LIBRARIAN

| Файл | Кто | Русский (озвучивать) | English | Deutsch |
|---|---|---|---|---|
| m36_01 | HANDLER | В ХРАНИЛИЩЕ НЕ ХВАТАЕТ ЧЕТЫРЁХ СТРАНИЦ ДОСЬЕ. БИБЛИОТЕКАРЬ ХРАНИТ ИХ В СТЕЛЛАЖАХ. СОБЕРИ ВСЁ И ВЫХОДИ. | FOUR PAGES OF THE DOSSIER ARE MISSING FROM THE ARCHIVE. THE LIBRARIAN KEEPS THEM IN THE STACKS. COLLECT THEM ALL AND GET OUT. | IM ARCHIV FEHLEN VIER SEITEN DER AKTE. DER BIBLIOTHEKAR BEWAHRT SIE IN DEN REGALEN AUF. SAMMLE ALLE EIN UND VERSCHWINDE. |

### 37 — GHOST

| Файл | Кто | Русский (озвучивать) | English | Deutsch |
|---|---|---|---|---|
| m37_01 | HANDLER | ПРИЗРАК. ОДНА ТРЕВОГА — И ВСЁ СНАЧАЛА. ЗАМЕТЯТ — ПРОВАЛ. ДВИГАЙСЯ ЛЕГКО И ЖДИ ПРОМЕЖУТКОВ МЕЖДУ ВСПЫШКАМИ. | GHOST. ONE ALARM — AND YOU START OVER. IF THEY SPOT YOU — FAILURE. MOVE LIGHTLY AND WAIT FOR THE GAPS BETWEEN THE FLASHES. | GEIST. EIN ALARM — UND ALLES VON VORN. WIRST DU ENTDECKT, SCHEITERT DIE MISSION. BEWEGE DICH LEICHT UND WARTE AUF DIE PAUSEN ZWISCHEN DEN BLITZEN. |

### 38 — SNIPER NEST

| Файл | Кто | Русский (озвучивать) | English | Deutsch |
|---|---|---|---|---|
| m38_01 | HANDLER | ТЕБЕ ВЫДАЮТ ВИНТОВКУ. ПКМ — ПРИЦЕЛ, ВЫСТРЕЛ В ГОЛОВУ — ОДИН ПАТРОН. ПОСЛЕ ВЫСТРЕЛА ОСТАЛЬНЫЕ ПОБЕГУТ К ТЕБЕ — ПЕРЕКЛЮЧИСЬ НА АВТОМАТ. | YOU ARE ISSUED A RIFLE. RMB — SCOPE, A HEADSHOT TAKES ONE ROUND. AFTER A SHOT THE OTHERS WILL RUN AT YOU — SWITCH TO THE AUTOMATIC. | DU BEKOMMST EIN GEWEHR. RMT — ZIELFERNROHR, EIN KOPFSCHUSS KOSTET NUR EINE PATRONE. NACH EINEM SCHUSS RENNEN DIE ANDEREN AUF DICH ZU — WECHSLE ZUR AUTOMATIK. |

### 39 — HEAVY ARMOR

| Файл | Кто | Русский (озвучивать) | English | Deutsch |
|---|---|---|---|---|
| m39_01 | HANDLER | ТЯЖЁЛАЯ ПЕХОТА. ПУЛИ В ТУЛОВИЩЕ ОНИ ПОЧТИ НЕ ЧУВСТВУЮТ. ЦЕЛЬСЯ В ГОЛОВУ ИЛИ БЕРИ ДРОБОВИК. | HEAVY INFANTRY. THEY BARELY FEEL BULLETS TO THE TORSO. AIM FOR THE HEAD OR TAKE THE SHOTGUN. | SCHWERE INFANTERIE. KUGELN IN DEN RUMPF SPÜREN SIE KAUM. ZIEL AUF DEN KOPF ODER NIMM DIE SCHROTFLINTE. |

### 40 — BRIDGE

| Файл | Кто | Русский (озвучивать) | English | Deutsch |
|---|---|---|---|---|
| m40_01 | HANDLER | МОСТ УЗКИЙ, УКРЫТИЙ ПОЧТИ НЕТ. МАШИНЫ ПЕРЕКРЫЛИ ПОЛОСЫ. ИДИ ВПЕРЁД, СТРЕЛЯЙ ИЗ-ЗА КАПОТОВ. | THE BRIDGE IS NARROW, THERE IS ALMOST NO COVER. CARS BLOCK THE LANES. MOVE FORWARD, SHOOT FROM BEHIND THE HOODS. | DIE BRÜCKE IST SCHMAL, KAUM DECKUNG. AUTOS VERSPERREN DIE SPUREN. GEH VOR UND SCHIESS VON HINTER DEN MOTORHAUBEN. |

### 41 — SUBWAY RUSH

| Файл | Кто | Русский (озвучивать) | English | Deutsch |
|---|---|---|---|---|
| m41_01 | HANDLER | ДВЕ МИНУТЫ ДО ОТПРАВЛЕНИЯ. РАШЕРЫ ВЫХОДЯТ ИЗ ВАГОНОВ ПО ОДНОМУ И ПО ТРОЕ. НЕ ЖДИ — ИДИ ВПЕРЁД. | TWO MINUTES UNTIL DEPARTURE. RUSHERS COME OUT OF THE CARS ONE AT A TIME AND IN THREES. DON'T WAIT — KEEP MOVING. | ZWEI MINUTEN BIS ZUR ABFAHRT. RUSHER STEIGEN EINZELN UND ZU DRITT AUS DEN WAGEN. WARTE NICHT — GEH VOR. |

### 42 — SIEGE

| Файл | Кто | Русский (озвучивать) | English | Deutsch |
|---|---|---|---|---|
| m42_01 | HANDLER | ОНИ ИДУТ ВОЛНАМИ. ГЕНЕРАТОРЫ ДАЮТ СВЕТ И ДВЕРИ. ЗАПУСКАЙ КАЖДЫЙ И ДЕРЖИСЬ, ПОКА ПОЛНОСТЬЮ НЕ ЗАГРУЗИТСЯ. | THEY COME IN WAVES. THE GENERATORS POWER THE LIGHTS AND DOORS. START EACH ONE AND HOLD ON UNTIL IT FULLY LOADS. | SIE KOMMEN IN WELLEN. DIE GENERATOREN VERSORGEN LICHT UND TÜREN. STARTE JEDEN UND HALTE DURCH, BIS ER VOLLSTÄNDIG GELADEN IST. |

### 43 — TRAITOR

| Файл | Кто | Русский (озвучивать) | English | Deutsch |
|---|---|---|---|---|
| m43_01 | HANDLER | ЭТО ОН. БРОНЯ ДЕРЖИТ ПУЛИ — ЦЕЛЬСЯ В ГОЛОВУ. | THAT'S HIM. THE ARMOR STOPS BULLETS — AIM FOR THE HEAD. | DAS IST ER. DIE PANZERUNG HÄLT KUGELN AUF — ZIEL AUF DEN KOPF. |
| m43_02 | HANDLER | ЭТО ТОТ, КТО ПРОДАЛ ТЕБЯ. ТИХО ДО ЕГО КОМНАТЫ, ПОТОМ БОЙ. ОН В БРОНЕ — ЦЕЛЬСЯ В ГОЛОВУ. | THIS IS THE ONE WHO SOLD YOU OUT. SNEAK TO HIS ROOM, THEN FIGHT. HE IS ARMORED — AIM FOR THE HEAD. | DAS IST DER, DER DICH VERKAUFT HAT. LEISE ZU SEINEM ZIMMER, DANN KAMPF. ER TRÄGT PANZERUNG — ZIEL AUF DEN KOPF. |

### 44 — THE WARDEN RETURNS

| Файл | Кто | Русский (озвучивать) | English | Deutsch |
|---|---|---|---|---|
| m44_01 | HANDLER | СМОТРИТЕЛЬ ВЕРНУЛСЯ. ЭТО ВТОРОЙ РАЗ, КОГДА ТЫ ВСТРЕЧАЕШЬСЯ С НИМ. ЗДЕСЬ БОЧЕК НЕТ, ЗАТО ЕСТЬ ГРАНАТЫ. | THE WARDEN IS BACK. THIS IS THE SECOND TIME YOU MEET HIM. THERE ARE NO BARRELS HERE, BUT THERE ARE GRENADES. | DER AUFSEHER IST ZURÜCK. DAS IST DAS ZWEITE MAL, DASS DU IHM BEGEGNEST. HIER GIBT ES KEINE FÄSSER, DAFÜR GRANATEN. |

### 45 — BLUEPRINTS

| Файл | Кто | Русский (озвучивать) | English | Deutsch |
|---|---|---|---|---|
| m45_01 | HANDLER | ПЛАНЫ ХРАНИЛИЩА ЛЕЖАТ У АРХИТЕКТОРА. ТИХО, ВЗЛОМ, ПОТОМ ЧЕТЫРЕ ЛИСТА — И БЕГОМ ВНИЗ. | THE VAULT PLANS ARE WITH THE ARCHITECT. QUIETLY, A HACK, THEN FOUR SHEETS — AND RUN DOWNSTAIRS. | DIE PLÄNE DES TRESORS LIEGEN BEIM ARCHITEKTEN. LEISE, EIN HACK, DANN VIER BLÄTTER — UND RENN NACH UNTEN. |

### 46 — REHEARSAL

| Файл | Кто | Русский (озвучивать) | English | Deutsch |
|---|---|---|---|---|
| m46_01 | HANDLER | ПОСЛЕДНЯЯ РЕПЕТИЦИЯ ПЕРЕД НАСТОЯЩИМ ДЕЛОМ. ТИХО ДО СЕЙФА, ВЗРЫВ СТЕНЫ, ГРАБЁЖ И ЗАБЕГ ПОД ТАЙМЕРОМ. | THE LAST REHEARSAL BEFORE THE REAL JOB. QUIETLY TO THE SAFE, BLOW THE WALL, ROBBERY AND A RUN AGAINST THE TIMER. | DIE LETZTE PROBE VOR DEM ECHTEN JOB. LEISE ZUM TRESOR, DIE WAND SPRENGEN, RAUBEN UND EIN LAUF GEGEN DIE UHR. |

### 47 — COLD STORAGE

| Файл | Кто | Русский (озвучивать) | English | Deutsch |
|---|---|---|---|---|
| m47_01 | HANDLER | НА ХРАНЕНИИ — ОБРАЗЦЫ NEXA. ТИХО ВОЙТИ. ТИХО ВЫЙТИ. ЕСЛИ ЗАМЕТЯТ — БЕГИ. | STORED HERE: NEXA SAMPLES. GET IN QUIETLY. GET OUT QUIETLY. IF THEY SPOT YOU — RUN. | HIER LAGERN NEXA-PROBEN. LEISE REIN. LEISE RAUS. WENN SIE DICH ENTDECKEN — LAUF. |
| m47_02 | HANDLER | СИГНАЛИЗАЦИЯ. ПРОБИВАЙСЯ К ВЫХОДУ. | ALARM. FIGHT YOUR WAY TO THE EXIT. | ALARM. KÄMPF DICH ZUM AUSGANG DURCH. |
| m47_03 | HANDLER | ОНИ ВСЁ ЗНАЮТ. ДЕЙСТВУЙ БЫСТРО — ИХ СЛИШКОМ МНОГО. | THEY KNOW EVERYTHING. MOVE FAST — THERE ARE TOO MANY OF THEM. | SIE WISSEN ALLES. HANDLE SCHNELL — ES SIND ZU VIELE. |
| m47_04 | HANDLER | ХОЛОДНОЕ ХРАНИЛИЩЕ NEXA. ВНУТРИ — ОБРАЗЦЫ. ТИХО ВОЙТИ, ТИХО ВЫЙТИ. | NEXA COLD STORAGE. SAMPLES INSIDE. QUIET IN, QUIET OUT. | NEXA-KÜHLLAGER. DRINNEN LIEGEN PROBEN. LEISE REIN, LEISE RAUS. |
| m47_05 | HANDLER | БЛОКИРОВКА! ВЗОРВИ СТЕНУ ЗА ХРАНИЛИЩЕМ — ТАМ ТОННЕЛЬ К ГРУЗОВИКУ. | LOCKDOWN! BLOW THE WALL BEHIND THE VAULT — THERE IS A TUNNEL TO THE TRUCK. | LOCKDOWN! SPRENG DIE WAND HINTER DEM TRESOR — DAHINTER LIEGT EIN TUNNEL ZUM LASTWAGEN. |

### Общие (подставляются в разных миссиях)

| Файл | Кто | Русский (озвучивать) | English | Deutsch |
|---|---|---|---|---|
| gen_01 | HANDLER | ТЕБЯ ЗАСЕКЛИ! ОНИ ИДУТ К ТЕБЕ — ПЕРЕКЛЮЧИСЬ НА ОСНОВНОЕ ОРУЖИЕ. | YOU'RE SPOTTED! THEY ARE COMING FOR YOU — SWITCH TO YOUR MAIN WEAPON. | DU WURDEST ENTDECKT! SIE KOMMEN AUF DICH ZU — WECHSLE ZUR HAUPTWAFFE. |
| gen_02 | HANDLER | ПРЕСС ЗА СПИНОЙ! НЕ ОСТАНАВЛИВАЙСЯ! | THE COMPACTOR IS BEHIND YOU! DON'T STOP! | DIE PRESSE IST HINTER DIR! BLEIB NICHT STEHEN! |
| gen_03 | HANDLER | ДЕРЖИСЬ РЯДОМ. ОНИ УЖЕ ИДУТ. | STAY CLOSE. THEY ARE ALREADY COMING. | BLEIB IN DER NÄHE. SIE KOMMEN SCHON. |
| gen_04 | HANDLER | ЭТО ОН. БЕЙ ПО ГОЛОВЕ — БРОНЯ ДЕРЖИТ ПУЛИ. | THAT'S HIM. HIT THE HEAD — THE ARMOR STOPS BULLETS. | DAS IST ER. TRIFF DEN KOPF — DIE PANZERUNG HÄLT KUGELN AUF. |
| gen_05 | HANDLER | ЗАРЯДЫ УСТАНОВЛЕНЫ. УХОДИ — ВЗРЫВ ЧЕРЕЗ 16 СЕКУНД. | CHARGES SET. GET OUT — DETONATION IN 16 SECONDS. | LADUNGEN PLATZIERT. VERSCHWINDE — DETONATION IN 16 SEKUNDEN. |
| gen_06 | HANDLER | ЗАРЯДЫ УСТАНОВЛЕНЫ. УХОДИ — ВЗРЫВ ЧЕРЕЗ 18 СЕКУНД. | CHARGES SET. GET OUT — DETONATION IN 18 SECONDS. | LADUNGEN PLATZIERT. VERSCHWINDE — DETONATION IN 18 SEKUNDEN. |

## Не озвучивается (только текст на экране)

- Подписи мест в катсценах (`CAP(...)`, например «DETENTION BLOCK C — CELL 14»), цели, подсказки, лог заданий — это интерфейс.
- ~600 цитат на чёрном экране после проигрыша за столом HIGH / LOW (`js/quotes.js`) — по желанию, одним голосом (Диктор / 024).
- Слово «ОГРАБЛЕНИЕ» на мониторах в катсцене миссии 47 — графика; в этот момент играет трек `heistloud.mp3`.
