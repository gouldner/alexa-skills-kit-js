if [ -f config.json ] 
then
    zip -r TheBus.zip node_modules *.js config.json
else
    echo "Missing config.json, copy config.json.sample to config.json and set config values"
fi
