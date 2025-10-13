# Internationalization (i18n) Error Codes

## 📋 Purpose

Simple numeric error codes (`ERR_XXXX`) for easy translation across multiple languages.

---

## 🔢 Error Code Categories

| Range | Category | Examples |
|-------|----------|----------|
| **1xxx** | Authentication & Login | ERR_1001, ERR_1021, ERR_1041, ERR_1061 |
| **2xxx** | Registration | ERR_2001, ERR_2002, ERR_2003 |
| **3xxx** | User Management | ERR_3001, ERR_3021, ERR_3041 |
| **4xxx** | Database | ERR_4001, ERR_4002, ERR_4003 |
| **5xxx** | Email Service | ERR_5001, ERR_5002, ERR_5003 |
| **6xxx** | Validation | ERR_6001, ERR_6002, ERR_6003 |
| **7xxx** | Security | ERR_7001, ERR_7002, ERR_7003 |
| **9xxx** | General | ERR_9001, ERR_9002, ERR_9003 |

---

## 🎯 How It Works

### **Backend (Python)**

```python
# backend/src/constants/error_codes.py

# Access error code by key
from src.constants.error_codes import ERROR_CODES

error_code = ERROR_CODES["INVALID_PASSWORD"]  # Returns "ERR_1003"
```

### **API Response**

```json
POST /api/login
{
  "error_code": "ERR_1003",
  "message": "Invalid password",
  "status": "Failed"
}
```

### **Frontend (React/Vue/Angular)**

```javascript
// Load translation file based on user's language
import en from './i18n/en.json';
import es from './i18n/es.json';
import fr from './i18n/fr.json';

const translations = {
  'en': en,
  'es': es,
  'fr': fr
};

// User's preferred language
const userLanguage = 'es';  // Spanish

// API returns error_code
const response = {
  error_code: "ERR_1003",
  status: "Failed"
};

// Get translated message
const errorMessage = translations[userLanguage][response.error_code];
// Spanish: "Contraseña inválida"
// English: "Invalid password"
// French: "Mot de passe invalide"

// Display to user
showError(errorMessage);
```

---

## 📂 Translation Files Structure

### **English (en.json)**
```json
{
  "ERR_1001": "User not found with provided email",
  "ERR_1002": "Your account is pending approval",
  "ERR_1003": "Invalid password"
}
```

### **Spanish (es.json)**
```json
{
  "ERR_1001": "Usuario no encontrado con el correo electrónico proporcionado",
  "ERR_1002": "Su cuenta está pendiente de aprobación",
  "ERR_1003": "Contraseña inválida"
}
```

### **French (fr.json)**
```json
{
  "ERR_1001": "Utilisateur introuvable avec l'email fourni",
  "ERR_1002": "Votre compte est en attente d'approbation",
  "ERR_1003": "Mot de passe invalide"
}
```

---

## 🚀 Frontend Integration Examples

### **React Example**

```javascript
// hooks/useErrorTranslation.js
import { useState, useEffect } from 'react';

const translations = {
  'en': require('./i18n/en.json'),
  'es': require('./i18n/es.json'),
  'fr': require('./i18n/fr.json')
};

export const useErrorTranslation = () => {
  const [language, setLanguage] = useState('en');
  
  const translate = (errorCode) => {
    return translations[language][errorCode] || 'An error occurred';
  };
  
  return { translate, setLanguage, language };
};

// Component usage
function LoginForm() {
  const { translate } = useErrorTranslation();
  const [error, setError] = useState(null);
  
  const handleLogin = async () => {
    try {
      const response = await fetch('/api/login', {
        method: 'POST',
        body: JSON.stringify({ email, password })
      });
      
      const data = await response.json();
      
      if (data.error_code) {
        // Translate error code to user's language
        const message = translate(data.error_code);
        setError(message);
      }
    } catch (err) {
      setError(translate('ERR_9001'));
    }
  };
  
  return (
    <div>
      {error && <div className="error">{error}</div>}
      <button onClick={handleLogin}>Login</button>
    </div>
  );
}
```

---

### **Vue Example**

```javascript
// plugins/i18n.js
import en from './i18n/en.json';
import es from './i18n/es.json';
import fr from './i18n/fr.json';

const translations = { en, es, fr };

export default {
  install: (app) => {
    app.config.globalProperties.$t = (errorCode) => {
      const lang = localStorage.getItem('language') || 'en';
      return translations[lang][errorCode] || 'An error occurred';
    };
  }
};

// Component usage
<template>
  <div>
    <div v-if="errorCode" class="error">
      {{ $t(errorCode) }}
    </div>
  </div>
</template>

<script>
export default {
  data() {
    return {
      errorCode: null
    };
  },
  methods: {
    async login() {
      try {
        const response = await fetch('/api/login', {
          method: 'POST',
          body: JSON.stringify({ email, password })
        });
        const data = await response.json();
        
        if (data.error_code) {
          this.errorCode = data.error_code;
          // Vue automatically translates using $t()
        }
      } catch (err) {
        this.errorCode = 'ERR_9001';
      }
    }
  }
};
</script>
```

---

### **Angular Example**

```typescript
// services/i18n.service.ts
import { Injectable } from '@angular/core';
import en from './i18n/en.json';
import es from './i18n/es.json';
import fr from './i18n/fr.json';

@Injectable({ providedIn: 'root' })
export class I18nService {
  private translations = { en, es, fr };
  private currentLanguage = 'en';
  
  setLanguage(lang: string) {
    this.currentLanguage = lang;
  }
  
  translate(errorCode: string): string {
    return this.translations[this.currentLanguage][errorCode] 
      || 'An error occurred';
  }
}

// component usage
export class LoginComponent {
  constructor(private i18n: I18nService) {}
  
  async login() {
    try {
      const response = await fetch('/api/login', {
        method: 'POST',
        body: JSON.stringify({ email, password })
      });
      const data = await response.json();
      
      if (data.error_code) {
        const message = this.i18n.translate(data.error_code);
        this.showError(message);
      }
    } catch (err) {
      this.showError(this.i18n.translate('ERR_9001'));
    }
  }
}
```

---

## 🌍 Benefits

| Benefit | Description |
|---------|-------------|
| **Simple Codes** | `ERR_1003` easier than `AUTH_LOGIN_003` |
| **Easy Translation** | Direct mapping to JSON files |
| **Scalable** | Add new languages easily |
| **Type-Safe** | Frontend knows all error codes |
| **Consistent** | Same structure across all errors |
| **SEO-Friendly** | Translated errors for better UX |

---

## ✅ Complete Integration Example

### **1. Backend Returns Error Code**
```python
# Python exception
raise InvalidCredentialsException(
    error_code=ERROR_CODES["INVALID_PASSWORD"]  # "ERR_1003"
)

# API Response
{
  "error_code": "ERR_1003",
  "status": "Failed"
}
```

### **2. Frontend Receives Error**
```javascript
const response = await axios.post('/api/login', { email, password });
// response.data.error_code = "ERR_1003"
```

### **3. Frontend Translates**
```javascript
// User selected Spanish
const userLanguage = 'es';
const message = translations[userLanguage]["ERR_1003"];
// message = "Contraseña inválida"
```

### **4. Display to User**
```javascript
toast.error(message);
// Shows: "Contraseña inválida" (Spanish)
// or: "Invalid password" (English)
// or: "Mot de passe invalide" (French)
```

---

## 📝 Adding New Languages

1. Create new JSON file: `i18n/de.json` (German)
2. Translate all error codes:
```json
{
  "ERR_1001": "Benutzer mit der angegebenen E-Mail nicht gefunden",
  "ERR_1002": "Ihr Konto wartet auf Genehmigung",
  "ERR_1003": "Ungültiges Passwort"
}
```
3. Add to translations object:
```javascript
const translations = {
  'en': en,
  'es': es,
  'fr': fr,
  'de': de  // Add German
};
```

---

## 🎯 Error Code Reference

| Code | English | Spanish | French |
|------|---------|---------|--------|
| ERR_1001 | User not found | Usuario no encontrado | Utilisateur introuvable |
| ERR_1003 | Invalid password | Contraseña inválida | Mot de passe invalide |
| ERR_2001 | Email already registered | Email ya registrado | Email déjà enregistré |
| ERR_7003 | SQL injection detected | Intento de inyección SQL | Injection SQL détectée |

---

## 📦 Frontend Package Recommendations

### **React:**
- `react-i18next` - Full i18n solution
- `react-intl` - Format.js internationalization

### **Vue:**
- `vue-i18n` - Official Vue i18n plugin

### **Angular:**
- `@angular/localize` - Official Angular i18n
- `ngx-translate` - Third-party solution

---

**Your pharma IoT platform now supports multiple languages with simple error codes!** 🌍🎯



