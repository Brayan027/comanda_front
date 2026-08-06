===================================================
  CARPETA DE SONIDOS PERSONALIZADOS - DIANASIS COMANDAS
===================================================

Si deseas usar un archivo de sonido personalizado (.mp3 o .wav):

1. Coloca tu archivo de audio en esta carpeta con alguno de los siguientes nombres:
   - alerta.mp3
   - alerta.wav

2. En el archivo .env (de Frontend_comanda o Backend_comanda), configura:
   VITE_TIPO_SONIDO_PENDIENTES=4
   o
   TIPO_SONIDO_PENDIENTES=4

3. ¡Listo! El sistema reproducirá automáticamente tu archivo de audio personalizado cuando ingresen nuevos pedidos pendientes.
