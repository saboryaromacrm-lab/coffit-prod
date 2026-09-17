const fs=require("fs");
const B="C:/Users/USER/Downloads/coffitcostnew/frontend/src/pages";
const L="<",G=">";
function w(n,c){fs.writeFileSync(B+"/"+n,c);console.log("OK:",n,c.length,"bytes");}
