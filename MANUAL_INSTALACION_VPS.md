# Manual de Instalación y Despliegue en VPS

## Índice

1. [Requisitos Previos](#requisitos-previos)
2. [Preparación del VPS](#preparación-del-vps)
3. [Instalación de Dependencias](#instalación-de-dependencias)
4. [Configuración del Proyecto](#configuración-del-proyecto)
5. [Despliegue de la Aplicación](#despliegue-de-la-aplicación)
6. [Configuración de Servicios](#configuración-de-servicios)
7. [Seguridad](#seguridad)
8. [Mantenimiento](#mantenimiento)
9. [Solución de Problemas](#solución-de-problemas)

## Requisitos Previos

Antes de comenzar la instalación, asegúrese de contar con:

- Un VPS con al menos 2GB de RAM y 2 núcleos de CPU
- Sistema operativo Ubuntu 20.04 LTS o superior
- Acceso SSH al servidor con privilegios de administrador
- Un nombre de dominio (opcional pero recomendado)

## Preparación del VPS

### Actualización del Sistema

```bash
# Actualizar la lista de paquetes
sudo apt update

# Actualizar los paquetes instalados
sudo apt upgrade -y

# Instalar herramientas básicas
sudo apt install -y build-essential git curl wget nano
```

### Configuración de Zona Horaria

```bash
# Configurar la zona horaria
sudo timedatectl set-timezone America/Mexico_City  # Cambiar según su ubicación
```

## Instalación de Dependencias

### Node.js y npm

```bash
# Instalar Node.js v16.x
curl -fsSL https://deb.nodesource.com/setup_16.x | sudo -E bash -
sudo apt install -y nodejs

# Verificar la instalación
node -v  # Debería mostrar v16.x.x
npm -v   # Debería mostrar v8.x.x
```

### PostgreSQL

```bash
# Instalar PostgreSQL
sudo apt install -y postgresql postgresql-contrib

# Iniciar y habilitar el servicio
sudo systemctl start postgresql
sudo systemctl enable postgresql

# Configurar la base de datos
sudo -u postgres psql -c "CREATE USER crypto_user WITH PASSWORD 'su_contraseña_segura';"
sudo -u postgres psql -c "CREATE DATABASE crypto_payment_gateway;"
sudo -u postgres psql -c "GRANT ALL PRIVILEGES ON DATABASE crypto_payment_gateway TO crypto_user;"
```

### Redis

```bash
# Instalar Redis
sudo apt install -y redis-server

# Configurar Redis para iniciar automáticamente
sudo systemctl enable redis-server

# Iniciar el servicio
sudo systemctl start redis-server

# Verificar el estado
sudo systemctl status redis-server
```

### RabbitMQ

```bash
# Instalar RabbitMQ
sudo apt install -y rabbitmq-server

# Iniciar y habilitar el servicio
sudo systemctl start rabbitmq-server
sudo systemctl enable rabbitmq-server

# Crear usuario y asignar permisos (opcional, para mayor seguridad)
sudo rabbitmqctl add_user crypto_user 'su_contraseña_segura'
sudo rabbitmqctl set_user_tags crypto_user administrator
sudo rabbitmqctl set_permissions -p / crypto_user ".*" ".*" ".*"
```

## Configuración del Proyecto

### Clonar el Repositorio

```bash
# Crear directorio para la aplicación
mkdir -p /opt/crypto-payment-gateway
cd /opt/crypto-payment-gateway

# Clonar el repositorio
git clone <url-del-repositorio> .
```

### Instalar Dependencias del Proyecto

```bash
# Instalar dependencias
npm install
```

### Configurar Variables de Entorno

```bash
# Copiar el archivo de ejemplo
cp .env.example .env

# Editar el archivo de configuración
nano .env
```

Modifique las siguientes variables en el archivo `.env`:

```
# Configuración del Servidor
PORT=3000
NODE_ENV=production

# Configuración de la Base de Datos
DB_HOST=localhost
DB_PORT=5432
DB_USERNAME=crypto_user
DB_PASSWORD=su_contraseña_segura
DB_DATABASE=crypto_payment_gateway
DB_SCHEMA=public

# Configuración de Redis
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=  # Dejar en blanco si no se configuró contraseña

# Configuración de RabbitMQ
RABBITMQ_URL=amqp://localhost:5672
RABBITMQ_USERNAME=crypto_user  # O guest si no se configuró un usuario específico
RABBITMQ_PASSWORD=su_contraseña_segura  # O guest si no se configuró un usuario específico

# Configuración de Blockchain
BSC_MAINNET_RPC_URL=https://bsc-dataseed.binance.org/
BSC_MAINNET_WS_URL=wss://bsc-ws-node.nariox.org:443

# Direcciones de Contratos
USDT_CONTRACT_ADDRESS=0x55d398326f99059fF775485246999027B3197955

# Configuración de Wallet
HD_WALLET_MNEMONIC=su_frase_mnemónica_secreta
COLD_WALLET_ADDRESS=dirección_de_su_wallet_frío
HOT_WALLET_THRESHOLD=10000

# Seguridad
JWT_SECRET=una_clave_secreta_muy_larga_y_aleatoria
JWT_EXPIRATION=86400
API_KEY_SALT=un_salt_aleatorio_para_api_keys

# Logging
LOG_LEVEL=info

# Webhook
WEBHOOK_SECRET=su_clave_secreta_para_webhooks
WEBHOOK_MAX_RETRIES=5
WEBHOOK_RETRY_DELAY=60000
```

> **IMPORTANTE**: Nunca comparta ni exponga su archivo `.env` o las claves privadas. Asegúrese de que estos datos estén seguros y respaldados en un lugar seguro.

### Compilar el Proyecto

```bash
# Compilar el código TypeScript
npm run build
```

## Despliegue de la Aplicación

### Usando PM2 (Recomendado para Producción)

```bash
# Instalar PM2 globalmente
sudo npm install -g pm2

# Iniciar la aplicación con PM2
pm2 start dist/app.js --name crypto-payment-gateway

# Configurar PM2 para iniciar automáticamente al reiniciar el servidor
pm2 startup
# Ejecute el comando que PM2 le indique

# Guardar la configuración actual de PM2
pm2 save
```

### Configuración de Nginx como Proxy Inverso

```bash
# Instalar Nginx
sudo apt install -y nginx

# Crear configuración para el sitio
sudo nano /etc/nginx/sites-available/crypto-payment-gateway
```

Añada la siguiente configuración:

```nginx
server {
    listen 80;
    server_name su-dominio.com;  # Reemplace con su dominio o IP del servidor

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }
}
```

```bash
# Crear enlace simbólico para habilitar el sitio
sudo ln -s /etc/nginx/sites-available/crypto-payment-gateway /etc/nginx/sites-enabled/

# Verificar la configuración de Nginx
sudo nginx -t

# Reiniciar Nginx
sudo systemctl restart nginx
```

### Configuración de SSL con Certbot (Recomendado)

```bash
# Instalar Certbot
sudo apt install -y certbot python3-certbot-nginx

# Obtener certificado SSL
sudo certbot --nginx -d su-dominio.com

# Seguir las instrucciones en pantalla
```

## Configuración de Servicios

### Configuración de Firewall

```bash
# Instalar UFW si no está instalado
sudo apt install -y ufw

# Configurar reglas básicas
sudo ufw default deny incoming
sudo ufw default allow outgoing

# Permitir SSH, HTTP y HTTPS
sudo ufw allow ssh
sudo ufw allow http
sudo ufw allow https

# Activar el firewall
sudo ufw enable

# Verificar el estado
sudo ufw status
```

### Configuración de Respaldos Automáticos

```bash
# Crear directorio para respaldos
sudo mkdir -p /opt/backups/crypto-payment-gateway

# Crear script de respaldo
sudo nano /opt/backups/backup-crypto-gateway.sh
```

Añada el siguiente contenido al script:

```bash
#!/bin/bash

# Variables
TIMESTAMP=$(date +"%Y%m%d-%H%M%S")
BACKUP_DIR="/opt/backups/crypto-payment-gateway"
DB_NAME="crypto_payment_gateway"
DB_USER="crypto_user"
APP_DIR="/opt/crypto-payment-gateway"

# Crear respaldo de la base de datos
sudo -u postgres pg_dump $DB_NAME > $BACKUP_DIR/db-$TIMESTAMP.sql

# Comprimir respaldo
gzip $BACKUP_DIR/db-$TIMESTAMP.sql

# Respaldar archivos de configuración
cp $APP_DIR/.env $BACKUP_DIR/env-$TIMESTAMP.backup

# Eliminar respaldos antiguos (más de 7 días)
find $BACKUP_DIR -name "db-*.sql.gz" -type f -mtime +7 -delete
find $BACKUP_DIR -name "env-*.backup" -type f -mtime +7 -delete

echo "Respaldo completado: $TIMESTAMP"
```

```bash
# Hacer el script ejecutable
sudo chmod +x /opt/backups/backup-crypto-gateway.sh

# Configurar tarea cron para ejecutar el script diariamente
sudo crontab -e
```

Añada la siguiente línea:

```
0 2 * * * /opt/backups/backup-crypto-gateway.sh >> /var/log/crypto-gateway-backup.log 2>&1
```

## Seguridad

### Protección de Claves Privadas

- Almacene las claves privadas y frases mnemónicas en un gestor de contraseñas seguro.
- Considere el uso de un HSM (Hardware Security Module) para operaciones críticas.
- Nunca almacene claves privadas en texto plano en el servidor.

### Monitoreo de Seguridad

```bash
# Instalar Fail2ban para protección contra ataques de fuerza bruta
sudo apt install -y fail2ban

# Iniciar y habilitar el servicio
sudo systemctl start fail2ban
sudo systemctl enable fail2ban
```

## Mantenimiento

### Actualización del Sistema

Programar actualizaciones regulares del sistema:

```bash
# Crear script de actualización
sudo nano /opt/update-system.sh
```

Añada el siguiente contenido:

```bash
#!/bin/bash

# Actualizar paquetes
apt update
apt upgrade -y

# Limpiar paquetes no necesarios
apt autoremove -y
apt clean
```

```bash
# Hacer el script ejecutable
sudo chmod +x /opt/update-system.sh

# Configurar tarea cron para ejecutar semanalmente
sudo crontab -e
```

Añada la siguiente línea:

```
0 3 * * 0 /opt/update-system.sh >> /var/log/system-update.log 2>&1
```

### Monitoreo de Logs

```bash
# Ver logs de la aplicación
pm2 logs crypto-payment-gateway

# Ver logs del sistema
sudo journalctl -u postgresql
sudo journalctl -u redis-server
sudo journalctl -u rabbitmq-server
```

### Reinicio de Servicios

```bash
# Reiniciar la aplicación
pm2 restart crypto-payment-gateway

# Reiniciar servicios de base de datos
sudo systemctl restart postgresql
sudo systemctl restart redis-server
sudo systemctl restart rabbitmq-server

# Reiniciar Nginx
sudo systemctl restart nginx
```

## Solución de Problemas

### Problemas Comunes y Soluciones

#### La aplicación no inicia

1. Verificar logs de la aplicación:
   ```bash
   pm2 logs crypto-payment-gateway
   ```

2. Verificar que todas las variables de entorno estén correctamente configuradas:
   ```bash
   cat /opt/crypto-payment-gateway/.env
   ```

3. Verificar que todos los servicios estén funcionando:
   ```bash
   sudo systemctl status postgresql
   sudo systemctl status redis-server
   sudo systemctl status rabbitmq-server
   ```

#### Problemas de conexión a la base de datos

1. Verificar que PostgreSQL esté ejecutándose:
   ```bash
   sudo systemctl status postgresql
   ```

2. Verificar la configuración de la base de datos:
   ```bash
   sudo -u postgres psql -c "\l"
   ```

3. Verificar que el usuario tenga los permisos correctos:
   ```bash
   sudo -u postgres psql -c "\du"
   ```

#### Problemas con RabbitMQ

1. Verificar el estado del servicio:
   ```bash
   sudo systemctl status rabbitmq-server
   ```

2. Verificar usuarios y permisos:
   ```bash
   sudo rabbitmqctl list_users
   sudo rabbitmqctl list_permissions
   ```

#### Problemas con Redis

1. Verificar el estado del servicio:
   ```bash
   sudo systemctl status redis-server
   ```

2. Probar la conexión a Redis:
   ```bash
   redis-cli ping
   ```

### Contacto de Soporte

Si encuentra problemas que no puede resolver, contacte al equipo de soporte técnico:

- Email: soporte@ejemplo.com
- Sistema de tickets: https://soporte.ejemplo.com

---

## Notas Adicionales

- Realice respaldos regulares de la base de datos y archivos de configuración.
- Mantenga un registro de cambios y actualizaciones realizadas en el servidor.
- Revise periódicamente los logs del sistema para detectar posibles problemas.
- Implemente un sistema de monitoreo para recibir alertas sobre problemas en el servidor.

---

*Este manual fue creado para la instalación y despliegue de la pasarela de pagos de criptomonedas en un entorno de producción. Última actualización: [Fecha actual]*