const UNINASSAU_COORDS = {
  lat: -8.2098,
  lon: -34.9221
};

// Elementos do DOM
const cepInput = document.getElementById('cep');
const cepForm = document.getElementById('cepForm');
const loading = document.getElementById('loading');
const errorMessage = document.getElementById('errorMessage');
const errorText = document.getElementById('errorText');
const resultCard = document.getElementById('resultCard');

// Elementos de Saída
const resLogradouro = document.getElementById('resLogradouro');
const resBairroCidade = document.getElementById('resBairroCidade');
const resDistancia = document.getElementById('resDistancia');
const resTempo = document.getElementById('resTempo');
const resValor = document.getElementById('resValor');

// Máscara e validação do CEP
cepInput.addEventListener('input', (e) => {
  let value = e.target.value.replace(/\D/g, '');
  if (value.length > 5) {
    value = value.replace(/^(\d{5})(\d)/, '$1-$2');
  }
  e.target.value = value;
});

// Evento ao submeter o formulário
cepForm.addEventListener('submit', (e) => {
  e.preventDefault();
  const cep = cepInput.value.replace(/\D/g, '');
  
  if (cep.length !== 8) {
    mostrarErro('Por favor, informe um CEP válido com 8 dígitos.');
    return;
  }

  processarCalculoFrete(cep);
});

// Função Principal
async function processarCalculoFrete(cep) {
  ocultarErro();
  ocultarResultado();
  exibirLoading(true);

  try {
    // 1. Busca Endereço no ViaCEP
    const dadosCep = await buscarViaCEP(cep);

    if (dadosCep.erro) {
      throw new Error('CEP não encontrado na base de dados.');
    }

    // 2. Geocodificação (Obter lat/lon do CEP via Nominatim/OpenStreetMap)
    const coordsDestino = await buscarCoordenadas(dadosCep);

    // 3. Calcular Distância em Linha Reta e Estimativa
    const distanciaKm = calcularDistanciaHaversine(
      UNINASSAU_COORDS.lat,
      UNINASSAU_COORDS.lon,
      coordsDestino.lat,
      coordsDestino.lon
    );

    // Considera rota urbana (~1.3x maior que linha reta)
    const distanciaRota = distanciaKm * 1.3;

    // 4. Calcular Tarifa Estimada do Uber Moto
    const precoUberMoto = calcularPrecoUberMoto(distanciaRota);
    const tempoEstimado = Math.round((distanciaRota / 28) * 60); // Média de 28 km/h em trânsito urbano

    // 5. Exibir Resultados
    exibirResultados(dadosCep, distanciaRota, tempoEstimado, precoUberMoto);

  } catch (error) {
    mostrarErro(error.message || 'Erro ao processar a solicitação. Tente novamente.');
  } finally {
    exibirLoading(false);
  }
}

// API ViaCEP
async function buscarViaCEP(cep) {
  const response = await fetch(`https://viacep.com.br/ws/${cep}/json/`);
  if (!response.ok) throw new Error('Erro na conexão com o serviço de CEP.');
  return await response.json();
}

// API OpenStreetMap (Nominatim) para obter Coordenadas
async function buscarCoordenadas(dadosCep) {
  const query = encodeURIComponent(`${dadosCep.logradouro || ''}, ${dadosCep.bairro || ''}, ${dadosCep.localidade} - ${dadosCep.uf}, Brasil`);
  const response = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${query}&limit=1`);
  
  if (!response.ok) throw new Error('Erro ao buscar localização do CEP.');
  
  const data = await response.json();
  if (data && data.length > 0) {
    return {
      lat: parseFloat(data[0].lat),
      lon: parseFloat(data[0].lon)
    };
  }

  // Fallback para o município caso a rua exata não seja geolocalizada
  const queryCidade = encodeURIComponent(`${dadosCep.localidade} - ${dadosCep.uf}, Brasil`);
  const respCidade = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${queryCidade}&limit=1`);
  const dataCidade = await respCidade.json();

  if (dataCidade && dataCidade.length > 0) {
    return {
      lat: parseFloat(dataCidade[0].lat),
      lon: parseFloat(dataCidade[0].lon)
    };
  }

  throw new Error('Não foi possível localizar as coordenadas deste CEP.');
}

// Fórmula de Haversine (Distância entre dois pontos no globo)
function calcularDistanciaHaversine(lat1, lon1, lat2, lon2) {
  const R = 6371; // Raio da Terra em Km
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  
  const a = 
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * 
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
    
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function toRad(graus) {
  return graus * (Math.PI / 180);
}

// Cálculo da Tarifa do Uber Moto
function calcularPrecoUberMoto(distanciaKm) {
  const tarifaBase = 4.50;      // Taxa fixa inicial
  const precoPorKm = 1.40;      // Valor estimado por km rodado
  const precoMinimo = 6.00;     // Tarifa mínima cobrada

  let total = tarifaBase + (distanciaKm * precoPorKm);
  
  if (total < precoMinimo) {
    total = precoMinimo;
  }

  return total;
}

// Atualiza a Interface com os dados
function exibirResultados(dadosCep, distancia, tempo, preco) {
  const rua = dadosCep.logradouro ? dadosCep.logradouro : 'Rua/Avenida não mapeada';
  resLogradouro.textContent = rua;
  resBairroCidade.textContent = `${dadosCep.bairro || 'Bairro N/D'} — ${dadosCep.localidade}/${dadosCep.uf}`;
  
  resDistancia.textContent = `${distancia.toFixed(1)} km`;
  resTempo.textContent = `${tempo < 5 ? 5 : tempo} min`;
  
  resValor.textContent = preco.toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL'
  });

  resultCard.classList.remove('hidden');
}

// Utilitários de Interface
function exibirLoading(status) {
  if (status) {
    loading.classList.remove('hidden');
  } else {
    loading.classList.add('hidden');
  }
}

function mostrarErro(mensagem) {
  errorText.textContent = mensagem;
  errorMessage.classList.remove('hidden');
}

function ocultarErro() {
  errorMessage.classList.add('hidden');
}

function ocultarResultado() {
  resultCard.classList.add('hidden');
}

function limparBusca() {
  cepInput.value = '';
  ocultarResultado();
  ocultarErro();
  cepInput.focus();
}