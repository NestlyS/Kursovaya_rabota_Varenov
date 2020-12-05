"use strict";

const defaultRandomizer = function* () {
  const a = 37;
  const b = 1;
  const M = 1000;
  let x = 0;
  const createNewX = () => {
    x = (a * x + b) % M;
    return x;
  };
  while (true) {
    yield createNewX() / M;
  }
};

const linearRandomizer = function* () {
  while (true) {
    yield Math.random();
  }
};

const expRandomizer = function* (lambda) {
  while (true) {
    yield -1 * (1 / lambda) * Math.log(Math.random());
  }
};

const generateRandomizer = function (type, { lambda }) {
  switch (type) {
    case "linear":
      return linearRandomizer();
    case "exponential":
      return expRandomizer(lambda);
    default:
      return defaultRandomizer();
  }
};

const randomTimeIntervalGenerator = function* (
  Tmin,
  Tmax = Tmin,
  type,
  { lambda } = {}
) {
  let _Tmin = Tmin;
  let _Tmax = Tmax;
  let _type = type;
  // Если подан некорректный Tmin
  if (!Tmin) {
    _Tmin = 0;
    _Tmax = 0;
    _type = "default";
  }
  // Если не подан Tmax
  if (!_Tmax || _Tmax < _Tmin) {
    _Tmax = _Tmin;
  }
  const randomizer = generateRandomizer(_type, { lambda });
  while (true) {
    if (type === "exponential") {
      yield +randomizer.next().value.toFixed(3);
    } else {
      const X = randomizer.next().value;
      const T = (_Tmax - _Tmin) * X + _Tmin;
      yield +T.toFixed(3);
    }
  }
};

const mainLogic = function ({
  // Неизменяемые программно величины
  currentTzValue,
  currentTsValue,
  maxBufferSize,
  // Изменяемые программно величины
  lastSuccessTzValue,
  Notk,
  Nobr,
  P,
  progsInBuffer,
  endOfProcessing,
}) {
  // ФАЗА ИНИЦИАЛИЗАЦИИ

  // Инкапсулируем логику работы программы от внешних воздействий
  let _Notk = Notk;
  let _Nobr = Nobr;
  let _lastSuccessTzValue = lastSuccessTzValue;
  let _endOfProcessing = endOfProcessing;
  const _progsInBuffer = [...progsInBuffer];
  const _P = [...P];
  // А также стандартизируем возвращаемые из программы значения
  const mlContinue = () => ({
    Notk: _Notk,
    Nobr: _Nobr,
    P: _P,
    progsInBuffer: _progsInBuffer,
    endOfProcessing: _endOfProcessing,
    lastSuccessTzValue: _lastSuccessTzValue,
  });
  // ФАЗА ОБРАБОТКИ

  // Если ВС загружена другой программой
  if (currentTzValue < _endOfProcessing) {
    // То помещаем программу в буффер
    // Но перед этим проверяем, есть ли место в буффере
    if (_progsInBuffer.length >= maxBufferSize) {
      // Если нет, то отбрасываем программу
      _Notk += 1;
      return mlContinue();
    }
    _P[_progsInBuffer.length + 1] += currentTzValue - _lastSuccessTzValue;
    _progsInBuffer.push(currentTsValue);
    _lastSuccessTzValue = currentTzValue;
    return mlContinue();
  }
  // Также не стоит забывать, что до исключения программы из буффера она тоже отработала
  // некоторый промежуток времени, который будет не учтен при пересчете. Так что просчитаем
  // его сейчас
  _P[_progsInBuffer.length + 1] += _endOfProcessing - _lastSuccessTzValue;
  // Плюс отмечаем, что одна программа уже точно выполнена
  _Nobr += 1;
  _lastSuccessTzValue = currentTzValue;
  // Иначе ВС либо завершила работу прямо в этот промежуток времени, либо раньше
  // Проверяем, пуст ли буффер
  // Если нет, то это значит, что ВС уже загружена последней программой из буффера
  // Освобождаем буффер в порядке очереди и одновременно добавляем текущую программу в буффер
  // Если все программы успевают выполниться до прихода следующей программы, то идем дальше
  let shouldContinue = false;
  while (_progsInBuffer.length > 0) {
    let lastEndOfProcessing = _endOfProcessing;
    _endOfProcessing += _progsInBuffer.shift();
    // Если буффер все таки не успел опустошиться полностью
    if (currentTzValue < _endOfProcessing) {
      _P[_progsInBuffer.length + 1] += currentTzValue - lastEndOfProcessing;
      _progsInBuffer.push(currentTsValue);
      shouldContinue = true;
      break;
    }
    // Одна программа была вытащена из буффера и выполнена перед приходом текущей программы
    _Nobr += 1;
    // А также считаем промежуток, который ВС находилась в состоянии выполнения программы
    _P[_progsInBuffer.length + 1] += _endOfProcessing - lastEndOfProcessing;
  }
  if (shouldContinue) return mlContinue();
  // Если и буффер пуст, значит ВС простаивает, так как обрабатывать ей нечего
  // Просто загружаем программу в ВС
  _P[_progsInBuffer.length] += currentTzValue - _endOfProcessing;
  _endOfProcessing = currentTsValue + currentTzValue;
  return mlContinue();
};

const calculate = async function ({
  maxBufferSize = 0,
  Tsmin = 0,
  Tsmax = 0,
  Tzmin = 0,
  Tzmax = 0,
  maxTime = 0,
  type = "default",
  lambda: _lambda = 0,
  callback = () => {}, // Вызывается в конце каждой итерации обработки данных
}) {
  let lambda = 0;
  let mu = 0;
  // Время, когда ВС закончит обработку
  // В первый раз ВС свободна с самого начала
  let endOfProcessing = 0;
  // Очередь программ, требующих обработки
  // Работает по принципу FIFO
  let progsInBuffer = [];
  // Счетчик того, сколько времени была загружена ВС
  // Первая ячейка соответствует P0, вторая - P1 и тд
  let P = [0, 0, 0, 0, 0];
  // Переменная для количества обработанных программ
  let Nobr = -1;
  // Переменная для количества необработанных программ
  let Notk = 0;
  // Число всего заявок для ВС
  let Nsum = 0;
  // Время последней обработанной (не отклоненной) программы
  let lastSuccessTzValue = 0;

  // Массив с временными отметками, когда приходит каждая из программ
  // Изначально содержит 0, так как событие включения сервера - тоже событие
  //const TzArray = [0];
  let currentTzValue = 0;
  let TzSum = 0;
  const TzRandomizer = randomTimeIntervalGenerator(Tzmin, Tzmax, type, {
    lambda: _lambda,
  });
  //const TsArray = [0];
  let currentTsValue = 0;
  let TsSum = 0;
  const _mu = 2 / (Tsmin + Tsmax);
  const TsRandomizer = randomTimeIntervalGenerator(Tsmin, Tsmax, type, {
    lambda: _mu,
  });
  let currentTime = TzRandomizer.next().value;
  while (currentTime < maxTime) {
    setTimeout(
      ((_currentTime) => () => {
        // TzArray.push(+_currentTime.toFixed(3));
        currentTzValue = +_currentTime.toFixed(3);
        TzSum = currentTzValue;
        // TsArray.push(+TsRandomizer.next().value.toFixed(3));
        currentTsValue = +TsRandomizer.next().value.toFixed(3);
        TsSum += currentTsValue;
        // Фиксируем приход ещё одной программы
        Nsum += 1;
        // Главная логика программы хранится в отдельной функции
        const newData = mainLogic({
          currentTzValue,
          currentTsValue,
          maxBufferSize,
          lastSuccessTzValue,
          Notk,
          Nobr,
          P,
          progsInBuffer,
          endOfProcessing,
        });
        // Вытаскиваем обновленные данные из пришедшего объекта
        // Массивы и объекты обновляются по ссылке, поэтому их не трогаем
        Notk = newData.Notk;
        Nobr = newData.Nobr;
        endOfProcessing = newData.endOfProcessing;
        progsInBuffer = newData.progsInBuffer;
        lastSuccessTzValue = newData.lastSuccessTzValue;
        P = newData.P;
        mu = Nsum / TsSum; // Интенсивность обработки заявок ВС
        lambda = Nsum / TzSum; // Интенсивность поступления заявок
        // Вызываем функцию, чтобы обновить интерфейс
        callback({
          Notk,
          Nobr,
          Nsum,
          mu,
          lambda,
          P,
        });
      })(currentTime)
    );
    currentTime += TzRandomizer.next().value;
  }
  setTimeout(() => {
    P[progsInBuffer.length + 1] += endOfProcessing - lastSuccessTzValue;
    Nobr += 1;
    Notk += progsInBuffer.length;
    callback({
      Notk,
      Nobr,
      P,
      mu,
      lambda,
      Nsum,
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
const radioExp = document.querySelector("#exp");
const lambdaObj = document.querySelector("#lambda");
const radioLinear = document.querySelector("#linear");
const radioDefault = document.querySelector("#default");

document.body.addEventListener("click", (event) => {
  if (radioExp.checked) {
    Tzmin.setAttribute("disabled", true);
    Tzmax.setAttribute("disabled", true);
    lambdaObj.removeAttribute("disabled");
  } else {
    Tzmin.removeAttribute("disabled");
    Tzmax.removeAttribute("disabled");
    lambdaObj.setAttribute("disabled", true);
  }
});

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

  // Тип генерации случайных величин
  let type, lambda;
  if (radioExp.checked) {
    type = radioExp.value;
    lambda = Number(lambdaObj.value) || 0;
  }
  if (radioLinear.checked) {
    type = radioLinear.value;
  }
  if (radioDefault.checked) {
    type = radioDefault.value;
  }
  calculate({
    maxBufferSize: maxBufferSizeValue,
    Tsmin: TsminValue,
    Tsmax: TsmaxValue,
    Tzmin: TzminValue,
    Tzmax: TzmaxValue,
    maxTime,
    type,
    lambda,
    callback: ({ Notk, Nsum, Nobr, mu, lambda, P }) => {
      const sumTime = P[1] + P[2] + P[3] + P[4] + P[0];
      const Qvalue = Nobr / Nsum;
      let NbufVal = 0;
      for (let i = 1; i < P.length - 1; i++) {
        NbufVal += +((i * P[i + 1]) / sumTime).toFixed(3);
      }
      P0.textContent = `${+((P[0] / sumTime) * 100).toFixed(2)}%`;
      P1.textContent = `${+((P[1] / sumTime) * 100).toFixed(2)}%`;
      P2.textContent = `${+((P[2] / sumTime) * 100).toFixed(2)}%`;
      P3.textContent = `${+((P[3] / sumTime) * 100).toFixed(2)}%`;
      P4.textContent = `${+((P[4] / sumTime) * 100).toFixed(2)}%`;
      Potk.textContent = `${+((Notk / Nsum) * 100).toFixed(2)}%`;
      Q.textContent = `${+(Qvalue * 100).toFixed(2)}%`;
      S.textContent = +(Nobr / maxTime).toFixed(2);
      Nbuf.textContent = NbufVal;
      Nprog.textContent = NbufVal + P[1] / sumTime;
      Tprog.textContent = Qvalue / mu + NbufVal / lambda;
      Tbuf.textContent = NbufVal / lambda;
    },
  });
});
