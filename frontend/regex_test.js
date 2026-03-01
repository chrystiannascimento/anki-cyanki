const str = `Q: <!-- id: xOJe4zRcW_J5aZ2nUo1JA --> Em quais critérios deve se basear a estimativa de quantidade de licenças a contratar? 
A: Quantidade necessária ao órgão; expectativa de crescimento (servidores, estagiários, terceirizados); necessidade de ampliação do parque tecnológico; políticas de teletrabalho; e, para subscrição, flutuações de sazonalidade de demandas. 
Tags: portaria5950, dimensionamento, criterios, estimativa`;

// Match 1: ID
// Match 2: Front
// Match 3: Back 
// Match 4: Tags string
const regex = /^Q:\s*(?:<!--\s*id:\s*([\w-]+)\s*-->\s*)?([^\n]+)\r?\n^A:\s*([\s\S]+?)(?:\r?\n^Tags:\s*([^\n]+))?(?=\r?\n^Q:|$)/gm;

let match;
while ((match = regex.exec(str)) !== null) {
    const frontText = match[2].trim();
    const backText = match[3].trim();
    const tagsString = match[4];

    console.log("Original BackText:", backText);
    console.log("Captured TagsString:", tagsString);

    let tagsArray = [];
    if (tagsString) {
        tagsArray = tagsString.split(/[,|;|\s]+/).filter(t => t.trim() !== '');
    }

    console.log("Tags Array:", tagsArray);
}
