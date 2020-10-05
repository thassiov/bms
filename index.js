require('dotenv').config();
const fs = require('fs');
const { promisify } = require('util');
const got = require('got');
const text2png = require('text2png');
const mergeImages = require('merge-images');
const { Canvas, Image } = require('canvas');
const sizeOfImage = require('image-size');

const promiseWriteFile = promisify(fs.writeFile);
const promiseReadFile = promisify(fs.readFile);

const API_BASE_URL = 'https://api.github.com';

async function getStuffFromGithub(url, token) {
  return got(url, {
    headers: {
      'authorization': `token ${token}`,
      'user-agent': 'behold... my stuff!',
    },
  });
}

async function getUserRepos() {
  const token = process.env.GITHUB_USER_TOKEN;
  const url = `${API_BASE_URL}/users/${process.env.USERNAME}/repos`;
  const { body } = await getStuffFromGithub(url, token);
  return JSON.parse(body)
    .filter(repo => !repo.private)
    .map(repo => ({
      name: repo.name,
      description: repo.description || '',
      language: repo.language || '',
      license: repo.license ? repo.license.key : '',
      open_issues: repo.open_issues,
      updated_at: repo.updated_at,
    }));
}

async function getUserGists() {
  const token = process.env.GITHUB_USER_TOKEN;
  const url = `${API_BASE_URL}/users/${process.env.USERNAME}/gists`;
  const { body } = await getStuffFromGithub(url, token);
  return JSON.parse(body)
    .filter(gist => gist.public && gist.description)
    .map(gist => ({
      description: gist.description,
      comments: gist.comments,
      updated_at: gist.updated_at,
      language: Object.entries(gist.files)
      .map(([_, value]) => value.type.split('/')[1]),
    }));
}

async function renderRepoCards(repos) {
  const cards = await Promise
    .all(repos.map((repo) => buildRepoCard(repo)));

  const finalImage = await buildMainImage(cards);

  await writeImage(`/tmp/readme.png`, finalImage);
}

async function buildMainImage(cards) {
  const card = cards[0];
  const baseImage = await loadBaseImage();
  const { height: baseImageHeight, width: baseImageWidth } = await getImageDimensions(baseImage);

  const baseImageHeigthPercent = baseImageHeight/100;
  const baseImageWidthPercent = baseImageWidth/100;
  return await mergeImages([
    { src: baseImage, x: 0, y: 0 },
    { src: card, x: (baseImageWidthPercent*30), y: (baseImageHeigthPercent*80) },
  ],{
    Canvas,
    Image,
  }).then(base64Img => bufferFromBase64Image(base64Img));
}

async function buildRepoCard(repo) {
  const repoHeader = await buildRepoCardHeader(repo.name, repo.language);
  const repoBody = await buildRepoBody(repo);

  const { height: headerHeight } = await getImageDimensions(repoHeader);
  const { height: bodyHeight } = await getImageDimensions(repoBody);

  const repoCard = await mergeImages([
    { src: repoHeader, x: 0, y: 0 },
    { src: repoBody , x: 0, y: (headerHeight) }
  ], {
    Canvas,
    Image,
    height: headerHeight + bodyHeight,
  }).then(base64Img => bufferFromBase64Image(base64Img));

  return repoCard;
}

async function buildRepoCardHeader(name, language = '') {
  const nameImg = text2png(name, {
    color: 'black',
    font: '20px monospace',
    backgroundColor: 'white',
    padding: 5
  });

  if(!language) {
    return nameImg;
  }

  const { width: nameImgWidth } = await getImageDimensions(nameImg);

  const langImg = text2png(language, {
    color: 'black',
    font: '10px monospace',
    backgroundColor: 'white',
    padding: 5
  });

  const { width: langImgWidth } = await getImageDimensions(langImg);

  console.log(langImgWidth, nameImgWidth);

  return mergeImages([
    { src: nameImg, x: 0, y: 0 },
    { src: langImg, x: nameImgWidth, y: 6 },
  ], {
    Canvas,
    Image,
    width: nameImgWidth + langImgWidth,
  }).then(base64Img => bufferFromBase64Image(base64Img));
}

async function buildRepoBody(repo) {
  let txt = `${repo.description}\nOpen issues: ${repo.open_issues}`;

  if (repo.license) {
    txt += ` - ${repo.license.toUpperCase()}`;
  }

  return text2png(txt, {
    color: 'black',
    font: '10px monospace',
    backgroundColor: 'white',
    padding: 5
  });
}

function bufferFromBase64Image(base64String) {
  return Buffer.from(base64String.split(';base64,').pop(), 'base64');
}

async function getImageDimensions(image) {
  return sizeOfImage(image);
}

async function writeImage(name, buffer) {
  console.log('writing image:', name);
  return promiseWriteFile(name, buffer);
}

async function loadBaseImage() {
  return promiseReadFile(`${__dirname}/assets/behold.png`);
}

(async () => {
  await getUserRepos().then(repos => renderRepoCards(repos));
  // await getUserGists();
})();
