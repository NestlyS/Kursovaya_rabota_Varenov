const generateRandomizer = function (Tmin, Tmax) {
  /*
  const mathOjid = Tmin * 0.5 + Tmax * 0.5;
  const dispersia = Tmin ** 2 * 0.5 + Tmax ** 2 * 0.5 - mathOjid ** 2;
  return (argX) => {
    const x = argX || Math.random() * (Tmax - Tmin) + Tmin;
    return (
      (1 / (dispersia * Math.sqrt(2 * Math.PI))) *
      Math.exp(-1 * ((x - mathOjid) ** 2 / (2 * dispersia * dispersia)))
    );
  };
  */
  const a = 29;
  const b = 1;
  const M = 1000;
  let x = 0;
  const createNewX = () => {
    x = (a * x + b) % M;
    return x;
  };
  return () => createNewX() / M;
};

const generateRandomTimeInterval = function (Tmin, Tmax = Tmin) {
  if (!Tmax || Tmax < Tmin) {
    Tmax = Tmin;
  }
  const randomizer = generateRandomizer(Tmin, Tmax);
  return () => {
    const X = randomizer();
    const T = (Tmax - Tmin) * X + Tmin;
    return +T.toFixed(3);
  };
};

const calculate = function (
  maxBufferSize = 0,
  Tsmin = 0,
  Tsmax = 0,
  Tzmin = 0,
  Tzmax = 0,
  maxTime = 0
) {
  // Время, когда ВС закончит обработку
  // В первый раз ВС свободна с самого начала
  let endOfProcessing = 0;
  // Очередь программ, требующих обработки
  // Работает по принципу FIFO
  let progsInBuffer = [];
  // Счетчик того, сколько времени была загружена ВС
  // Первая ячейка соответствует P0, вторая - P1 и тд
  const P = [0, 0, 0, 0, 0];
  // Количество необработанных программ
  let Notk = 0;

  // Массив с временными отметками, когда приходит каждая из программ
  // Изначально содержит 0, так как событие включения сервера - тоже событие
  const TzArray = [0];
  const TzRandomizer = generateRandomTimeInterval(Tzmin, Tzmax);
  const TsArray = [0];
  const TsRandomizer = generateRandomTimeInterval(Tsmin, Tsmax);
  let currentTime = TzRandomizer();
  while (currentTime < maxTime) {
    TzArray.push(+currentTime.toFixed(3));
    TsArray.push(+TsRandomizer().toFixed(3));
    currentTime += TzRandomizer();
  }
  for (let i = 1; i < TzArray.length; i++) {
    // Если ВС загружена другой программой
    if (TzArray[i] < endOfProcessing) {
      // То помещаем программу в буффер
      // Но перед этим проверяем, есть ли место в буффере
      if (progsInBuffer.length >= maxBufferSize) {
        // Если нет, то отбрасываем программу
        Notk += 1;
        continue;
      }
      P[progsInBuffer.length + 1] += TzArray[i] - TzArray[i - 1];
      progsInBuffer.push(TsArray[i]);
      continue;
    }
    // Также не стоит забывать, что до исключения программы из буффера она тоже отработала
    // некоторый промежуток времени, который будет не учтен при пересчете. Так что просчитаем
    // его сейчас
    P[progsInBuffer.length] += TzArray[i] - endOfProcessing;
    P[progsInBuffer.length + 1] += endOfProcessing - TzArray[i - 1];
    // Иначе ВС либо завершила работу прямо в этот промежуток времени, либо раньше
    // Проверяем, пуст ли буффер
    // Если нет, то это значит, что ВС уже загружена последней программой из буффера
    // Освобождаем буффер в порядке очереди и одновременно добавляем текущую программу в буффер
    // Если все программы успевают выполниться до прихода следующей программы, то идем дальше
    let shouldContinue = false;
    while (progsInBuffer.length > 0) {
      endOfProcessing += progsInBuffer.shift();
      if (TzArray[i] < endOfProcessing) {
        progsInBuffer.push(TsArray[i]);
        shouldContinue = true;
        break;
      }
    }
    if (shouldContinue) continue;
    // Если и буффер пуст, значит ВС простаивает, так как обрабатывать ей нечего
    // Просто загружаем программу в ВС
    endOfProcessing = TsArray[i] + TzArray[i];
  }
  P[progsInBuffer.length + 1] += endOfProcessing - TzArray[TzArray.length - 1];
  debugger;
};

const Tzmin = document.querySelector("#Tzmin");
const Tzmax = document.querySelector("#Tzmax");
const Tsmin = document.querySelector("#Tsmin");
const Tsmax = document.querySelector("#Tsmax");
const maxBufferSize = document.querySelector("#bufferSize");
const workTime = document.querySelector("#workTime");
const calculateButton = document.querySelector("#calculateButton");
const paramsForm = document.querySelector("#paramsForm");
const P0 = document.querySelector("#P0");
const P1 = document.querySelector("#P1");
const P2 = document.querySelector("#P2");
const P3 = document.querySelector("#P3");
const P4 = document.querySelector("#P4");
const Q = document.querySelector("#Q");
const S = document.querySelector("#S");
const Potk = document.querySelector("#Potk");
const Nprog = document.querySelector("#Nprog");
const Tprop = document.querySelector("#Tprop");
const Nbuf = document.querySelector("#Nbuf");
const Tbuf = document.querySelector("#Tbuf");

paramsForm.addEventListener("submit", (event) => {
  const maxBufferSizeValue = Number(maxBufferSize.value) || 0;
  const maxTime = Number(workTime.value) || 0;

  // Время на обработку программы
  const TsminValue = Number(Tsmin.value);
  const TsmaxValue = Number(Tsmax.value) || 0;

  // Время между приходами программы
  const TzminValue = Number(Tzmin.value);
  const TzmaxValue = Number(Tzmax.value) || 0;
  event.preventDefault();
  calculate(
    maxBufferSizeValue,
    TsminValue,
    TsmaxValue,
    TzminValue,
    TzmaxValue,
    maxTime
  );
});

/*
var ctx = document.getElementById("myChart").getContext("2d");
var chart = new Chart(ctx, {
  // The type of chart we want to create
  type: "bar",

  // The data for our dataset
  data: {
    labels: label,
    datasets: [
      {
        label: "My First dataset",
        backgroundColor: "rgb(255, 99, 132)",
        borderColor: "rgb(255, 99, 132)",
        data: data,
      },
    ],
  },

  // Configuration options go here
  options: {},
});
*/
