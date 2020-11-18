"use strict";

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
  const a = 37;
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
/*
const findLastItemWithCondition = (arrayA, arrayB, conditionOfFailure) => {
  let indexOfLastProcessed = arrayA.length - 1;
  // Идем по массиву с пришедшими числами с конца в начало
  for (let i = arrayA.length - 1; i >= 0; i--) {
    let elementWereNotDeclined = true;
    // И проверяем, не равен ли текущий элемент какому-либо из элементов в таблице отказов
    for (let j = 0; j < arrayB.length; j++) {
      // Если данный элемент был отклонен, то он нас не интересует
      if (conditionOfFailure(arrayA, arrayB)) {
        elementWereNotDeclined = false;
        break;
      }
    }
    // Если не был отклонен, то сохраняем его индекс и выходим
    if (elementWereNotDeclined) {
      indexOfLastProcessed = i;
      break;
    }
  }
  // Если возвращается -1, то все элементы были отклонены
  return indexOfLastProcessed;
};
*/

const mainLogic = function ({
  index,
  TzArray,
  TsArray,
  Notk,
  Nobr,
  P,
  progsInBuffer,
  endOfProcessing,
  successIdx,
  maxBufferSize,
}) {
  const mlContinue = () => ({
    Notk,
    Nobr,
    P,
    progsInBuffer,
    endOfProcessing,
    successIdx,
    maxBufferSize,
  });
  // Если ВС загружена другой программой
  if (TzArray[index] < endOfProcessing) {
    // То помещаем программу в буффер
    // Но перед этим проверяем, есть ли место в буффере
    if (progsInBuffer.length >= maxBufferSize) {
      // Если нет, то отбрасываем программу
      Notk += 1;
      return mlContinue();
    }
    P[progsInBuffer.length + 1] += TzArray[index] - TzArray[successIdx];
    progsInBuffer.push(TsArray[index]);
    successIdx = index;
    return mlContinue();
  }
  // Также не стоит забывать, что до исключения программы из буффера она тоже отработала
  // некоторый промежуток времени, который будет не учтен при пересчете. Так что просчитаем
  // его сейчас
  P[progsInBuffer.length] += TzArray[index] - endOfProcessing;
  P[progsInBuffer.length + 1] += endOfProcessing - TzArray[successIdx];
  // Плюс отмечаем, что одна программа будет выполнена
  Nobr += 1;
  successIdx = index;
  // Иначе ВС либо завершила работу прямо в этот промежуток времени, либо раньше
  // Проверяем, пуст ли буффер
  // Если нет, то это значит, что ВС уже загружена последней программой из буффера
  // Освобождаем буффер в порядке очереди и одновременно добавляем текущую программу в буффер
  // Если все программы успевают выполниться до прихода следующей программы, то идем дальше
  let shouldContinue = false;
  while (progsInBuffer.length > 0) {
    endOfProcessing += progsInBuffer.shift();
    if (TzArray[index] < endOfProcessing) {
      progsInBuffer.push(TsArray[index]);
      shouldContinue = true;
      break;
    }
  }
  if (shouldContinue) return mlContinue();
  // Если и буффер пуст, значит ВС простаивает, так как обрабатывать ей нечего
  // Просто загружаем программу в ВС
  endOfProcessing = TsArray[index] + TzArray[index];
  return mlContinue();
};

const calculate = function (
  maxBufferSize = 0,
  Tsmin = 0,
  Tsmax = 0,
  Tzmin = 0,
  Tzmax = 0,
  maxTime = 0,
  callback = () => {} // Вызывается в конце каждой итерации обработки данных
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
  // Переменная для количества обработанных программ
  let Nobr = -1;
  // Переменная для количества необработанных программ
  let Notk = 0;
  // Индекс последнего обработанной (не отклоненной) программы
  let successIdx = 0;

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
    setTimeout(() => {
      // Главная логика программы хранится в отдельной функции
      const newData = mainLogic({
        index: i,
        TzArray,
        TsArray,
        Notk,
        Nobr,
        P,
        progsInBuffer,
        endOfProcessing,
        successIdx,
        maxBufferSize,
      });
      // Вытаскиваем обновленные данные из пришедшего объекта
      // Массивы и объекты обновляются по ссылке, поэтому их не трогаем
      Notk = newData.Notk;
      Nobr = newData.Nobr;
      endOfProcessing = newData.endOfProcessing;
      maxBufferSize = newData.maxBufferSize;
      successIdx = newData.successIdx;
      callback({
        Notk,
        Nobr,
        Nsum: TzArray.length,
        P,
      });
    });
  }
  setTimeout(() => {
    P[progsInBuffer.length + 1] += endOfProcessing - TzArray[successIdx];
    Nobr += 1;
    callback({
      Notk,
      Nobr,
      P,
      Nsum: TzArray.length,
    });
  });
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
const Tprog = document.querySelector("#Tprop");
const Nbuf = document.querySelector("#Nbuf");
const Tbuf = document.querySelector("#Tbuf");

paramsForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const maxBufferSizeValue = Number(maxBufferSize.value) || 0;
  const maxTime = Number(workTime.value) || 0;

  // Время на обработку программы
  const TsminValue = Number(Tsmin.value);
  const TsmaxValue = Number(Tsmax.value) || 0;

  // Время между приходами программы
  const TzminValue = Number(Tzmin.value);
  const TzmaxValue = Number(Tzmax.value) || 0;
  calculate(
    maxBufferSizeValue,
    TsminValue,
    TsmaxValue,
    TzminValue,
    TzmaxValue,
    maxTime,
    ({ Notk, Nsum, Nobr, P }) => {
      const sumTime = P[1] + P[2] + P[3] + P[4];
      P0.textContent = `${+((P[0] / (sumTime + P[0])) * 100).toFixed(0)}%`;
      P1.textContent = `${+((P[1] / (sumTime + P[0])) * 100).toFixed(0)}%`;
      P2.textContent = `${+((P[2] / (sumTime + P[0])) * 100).toFixed(0)}%`;
      P3.textContent = `${+((P[3] / (sumTime + P[0])) * 100).toFixed(0)}%`;
      P4.textContent = `${+((P[4] / (sumTime + P[0])) * 100).toFixed(0)}%`;
      Potk.textContent = `${+((Notk / Nsum) * 100).toFixed(0)}%`;
      Q.textContent = `${+((Nobr / Nsum) * 100).toFixed(0)}%`;
      S.textContent = `${+((Nobr / maxTime) * 100).toFixed(0)}%`;
      const NbufVal = (1 * P[2] + 2 * P[3] + 3 * P[4]) / sumTime;
      Nbuf.textContent = NbufVal;
      const NprogVal = NbufVal + 1;
      Nprog.textContent = NprogVal;
      Tprog.textContent = ((TsminValue + TsmaxValue) / 2) * NprogVal;
    }
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
