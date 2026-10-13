# АУДИО СИСТЕМА — ДОКУМЕНТАЦИЯ

## МУЗЫКАЛЬНЫЕ ТРЕКИ

### MENU
- **Файл:** `assets/menu.mp3`
- **Громкость:** 60%
- **Loop:** ✅ YES
- **Когда:** Desktop / NEXA/OS экран

### PICK
- **Файл:** `assets/pick.m4a`
- **Громкость:** 60%
- **Loop:** ❌ NO (ИСПРАВЛЕНО!)
- **Когда:** Экран выбора числа (NUMBER SELECTION)

### GAME
- **Файл:** `assets/game.mp3`
- **Громкость:** 60%
- **Loop:** ✅ YES
- **Когда:** Игровой процесс (EXPERIMENT ACTIVE)

### HARDDRIVE
- **Файл:** `assets/harddrive.mp3`
- **Громкость:** 12%
- **Loop:** ✅ YES
- **Когда:** Постоянно с момента boot до выключения

## ЗВУКОВЫЕ ЭФФЕКТЫ (SFX)

### boot.mp3
- Загрузка системы

### mouse.mp3
- Клики по кнопкам
- LOCK NUMBER
- Системные действия

### notification.mp3
- Важные события
- HIGH / LOW результаты
- Auto-selection

### succesfully.mp3 (sucsesfully.mp3)
- Успешное действие
- LOCK NUMBER
- CORRECT результат
- Завершение эксперимента

### error.mp3
- Неправильное число
- Ошибки ввода

### denied.mp3
- ACCESS DENIED в ARCHIVE

### poweroff.mp3
- Выключение системы

## ПЕРЕХОДЫ МУЗЫКИ

### Сценарий 1: Новая игра
```
BOOT (boot.mp3 SFX)
  ↓
DESKTOP (menu.mp3+ harddrive.mp3)
  ↓
HIGH_LOW.exe
  ↓
EXPERIMENT SELECT (menu.mp3)
  ↓
PLAYER COUNT (menu.mp3)
  ↓
PARTICIPANTS (menu.mp3)
  ↓
[BEGIN EXPERIMENT]
  ↓
PICK (pick.m4a)
  ↓ [15 секунд]
GAME (game.mp3)
  ↓
RESULT (game.mp3)
  ↓
[RETURN TO MENU]
  ↓
DESKTOP (menu.mp3)
```

### Сценарий 2: С автовыбором
```
PICK (pick.m4a)
  ↓ [игрок не ввёл число]
  ↓ [15 секунд истекло]
AUTO-SELECTION (pick.m4a + notification.mp3)
  ↓ [2.4 секунды задержка]
GAME (game.mp3)
```

### Сценарий 3: ARCHIVE
```
DESKTOP (menu.mp3)
  ↓
[ARCHIVE]
  ↓
ARCHIVE (menu.mp3)
  ↓
[открыть denied file]
  ↓
(denied.mp3)
```

## ВАЖНЫЕ ДЕТАЛИ

### playMusic()
- Автоматически останавливает предыдущий трек
- Не перезапускает, если уже играет
- Проверяет `musicEnabled` флаг

### stopMusic()
- Останавливает ВСЕ музыкальные треки
- НЕ останавливает harddrive.mp3
- Сбрасывает currentTime в 0

### startHarddrive()
- Запускается ОДИН раз при boot
- Флаг `harddriveStarted` предотвращает дубликаты
- Не зависит от переключения музыки

### playSfx()
- Не зависит от музыки
- mouse.mp3 имеет дебаунс 120ms
- Проверяет `sfxEnabled` флаг

## КРИТИЧЕСКИЕ ИСПРАВЛЕНИЯ

### ❌ БЫЛО:
```javascript
pick: { src: 'assets/pick.m4a', volume: 0.6, loop: true }
```
**Проблема:** pick.m4a играл бесконечно, накладывался на game.mp3

### ✅ СТАЛО:
```javascript
pick: { src: 'assets/pick.m4a', volume: 0.6, loop: false }
```
**Решение:** pick.m4a играет один раз, затем корректно переключается на game.mp3

### Переключение PICK → GAME:
```javascript
} else if (event === 'picking-complete') {
  audio.stopMusic();
  setTimeout(function() {
    audio.playMusic('game');
  }, 100);
}
```

## ТЕСТИРОВАНИЕ

### Проверка музыки:
1. Открыть игру
2. Проверить: menu.mp3 + harddrive.mp3
3. Начать эксперимент
4. Проверить: pick.m4a играет
5. Дождаться перехода в GAME
6. Проверить: pick.m4a остановился
7. Проверить: game.mp3 запустился
8. Проверить: harddrive.mp3 продолжает играть

### Проверка SFX:
1. Клик по кнопке → mouse.mp3
2. LOCK NUMBER → succesfully.mp3
3. HIGH/LOW → notification.mp3
4. CORRECT → succesfully.mp3
5. AUTO-SELECTION → notification.mp3
6. Denied file → denied.mp3

## ГРОМКОСТЬ

### Master Volume
- По умолчанию: 55%
- Управление: settings slider

### Music Volume
- По умолчанию: 100%
- Применяется к: menu, game, pick

### SFX Volume
- По умолчанию: 100%
- Применяется к: boot, mouse, notification, denied, error, poweroff, succesfully

### Harddrive Volume
- Фиксированная: 12%
- НЕ зависит от musicVolume
- Всегда multiplier = 1.0

## BROWSER AUTOPLAY

### Unlock механизм:
```javascript
document.body.addEventListener('click', function () {
  audio.unlock();
}, { once: true });
```

- Первый клик пользователя разблокирует аудио
- После unlock все треки могут играть автоматически
- Settings кнопка также вызывает unlock()

## СОСТОЯНИЯ

### unlocked: false
- Аудио заблокировано браузером
- Треки не будут играть
- Требуется user interaction

### unlocked: true
- Аудио разблокировано
- Все треки работают нормально

### musicEnabled: true/false
- Управление музыкой
- SFX работают независимо

### sfxEnabled: true/false
- Управление звуковыми эффектами
- Музыка работает независимо

### harddriveStarted: false/true
- Предотвращает множественный запуск
- Harddrive запускается только один раз
