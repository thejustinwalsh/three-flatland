// Three.js r185 - Node System

// global
diagnostic( off, derivative_uniformity );


// structs

struct OutputStruct {
	@location( 0 ) color: vec4<f32>
};
var<private> output : OutputStruct;

// uniforms
@binding( 1 ) @group( 1 ) var nodeUniform6 : texture_2d<f32>;
@binding( 2 ) @group( 1 ) var nodeUniform7 : texture_2d<f32>;
@binding( 3 ) @group( 1 ) var nodeUniform8_sampler : sampler;
@binding( 4 ) @group( 1 ) var nodeUniform8 : texture_2d<f32>;

struct objectStruct {
	nodeUniform0 : vec2<f32>,
	nodeUniform1 : f32,
	nodeUniform2 : vec2<f32>,
	nodeUniform3 : f32,
	nodeUniform4 : vec2<f32>,
	nodeUniform5 : vec2<f32>,
	nodeUniform9 : f32,
	nodeUniform10 : f32,
	nodeUniform13 : mat4x4<f32>
};
@binding( 0 ) @group( 1 )
var<uniform> object : objectStruct;

// vars
var<private> nodeVar0 : f32;
var<private> nodeVar1 : vec3<f32>;
var<private> nodeVar2 : f32;
var<private> nodeVar3 : f32;
var<private> nodeVar4 : vec2<f32>;
var<private> nodeVar5 : bool;
var<private> nodeVar6 : vec2<f32>;
var<private> nodeVar7 : bool;
var<private> nodeVar8 : f32;
var<private> nodeVar9 : f32;
var<private> nodeVar10 : vec2<f32>;
var<private> nodeVar11 : vec2<f32>;
var<private> nodeVar12 : vec2<f32>;
var<private> nodeVar13 : i32;
var<private> nodeVar14 : i32;
var<private> nodeVar15 : i32;
var<private> nodeVar16 : i32;
var<private> nodeVar17 : vec2<i32>;
var<private> nodeVar18 : f32;
var<private> nodeVar19 : f32;
var<private> nodeVar20 : i32;
var<private> nodeVar21 : i32;
var<private> nodeVar22 : i32;
var<private> nodeVar23 : i32;
var<private> nodeVar24 : i32;
var<private> nodeVar25 : i32;
var<private> nodeVar26 : vec2<i32>;
var<private> nodeVar27 : vec3<f32>;
var<private> nodeVar28 : f32;
var<private> nodeVar29 : f32;
var<private> nodeVar30 : f32;
var<private> nodeVar31 : f32;
var<private> nodeVar32 : f32;
var<private> nodeVar33 : i32;
var<private> nodeVar34 : i32;
var<private> nodeVar35 : i32;
var<private> nodeVar36 : i32;
var<private> nodeVar37 : i32;
var<private> nodeVar38 : i32;
var<private> nodeVar39 : vec4<f32>;
var<private> nodeVar40 : i32;
var<private> nodeVar41 : i32;
var<private> nodeVar42 : i32;
var<private> nodeVar43 : i32;
var<private> nodeVar44 : i32;
var<private> nodeVar45 : i32;
var<private> nodeVar46 : i32;
var<private> nodeVar47 : i32;
var<private> nodeVar48 : i32;
var<private> nodeVar49 : i32;
var<private> nodeVar50 : i32;
var<private> nodeVar51 : i32;
var<private> nodeVar52 : i32;
var<private> nodeVar53 : vec4<f32>;
var<private> nodeVar54 : f32;
var<private> nodeVar55 : f32;
var<private> nodeVar56 : f32;
var<private> nodeVar57 : vec4<f32>;
var<private> nodeVar58 : i32;
var<private> nodeVar59 : f32;
var<private> nodeVar60 : i32;
var<private> nodeVar61 : i32;
var<private> nodeVar62 : i32;
var<private> nodeVar63 : i32;
var<private> nodeVar64 : i32;
var<private> nodeVar65 : i32;
var<private> nodeVar66 : vec4<f32>;
var<private> nodeVar67 : f32;
var<private> nodeVar68 : f32;
var<private> nodeVar69 : f32;
var<private> nodeVar70 : i32;
var<private> nodeVar71 : i32;
var<private> nodeVar72 : i32;
var<private> nodeVar73 : i32;
var<private> nodeVar74 : i32;
var<private> nodeVar75 : i32;
var<private> nodeVar76 : vec4<f32>;
var<private> nodeVar77 : f32;
var<private> nodeVar78 : f32;
var<private> nodeVar79 : f32;
var<private> nodeVar80 : vec3<f32>;
var<private> nodeVar81 : vec3<f32>;
var<private> nodeVar82 : vec4<f32>;
var<private> nodeVar83 : vec4<f32>;
var<private> nodeVar84 : vec3<f32>;
var<private> nodeVar85 : vec4<f32>;
var<private> nodeVar86 : f32;
var<private> nodeVar87 : f32;
var<private> nodeVar88 : vec3<f32>;
var<private> nodeVar89 : f32;
var<private> nodeVar90 : vec3<f32>;
var<private> nodeVar91 : f32;
var<private> nodeVar92 : f32;
var<private> nodeVar93 : vec2<f32>;
var<private> nodeVar94 : vec4<f32>;
var<private> nodeVar95 : vec4<f32>;
var<private> nodeVar96 : f32;
var<private> nodeVar97 : vec4<f32>;
var<private> nodeVar98 : vec4<f32>;
var<private> nodeVar99 : f32;
var<private> nodeVar100 : vec4<f32>;
var<private> nodeVar101 : vec4<f32>;
var<private> nodeVar102 : f32;
var<private> nodeVar103 : vec4<f32>;
var<private> nodeVar104 : vec4<f32>;
var<private> nodeVar105 : vec4<f32>;

// codes
fn tsl_mod_vec2( x : vec2f, y : vec2f ) -> vec2f { return x - y * floor( x / y ); }
fn tsl_mod_float( x : f32, y : f32 ) -> f32 { return x - y * floor( x / y ); }


@fragment
fn main( @location( 0 ) nodeVarying4 : vec2<f32> ) -> OutputStruct {

	// flow
	// code

	let rcFragCoord = ( nodeVarying4 * vec2<f32>( 672.0, 416.0 ) );
	let rcProbeGroupSize = vec2<f32>( 84.0, 52.0 );
	let rcRayXY = floor( ( rcFragCoord / rcProbeGroupSize ) );
	let rcProbeXY = tsl_mod_vec2( rcFragCoord, rcProbeGroupSize );
	let rcRayIndex = ( rcRayXY.x + ( rcRayXY.y * 8.0 ) );
	let rcActiveProbeXY = clamp( rcProbeXY, vec2<f32>( 0.5, 0.5 ), vec2<f32>( 83.5, 48.5 ) );
	let rcProbeUV = clamp( ( ( rcActiveProbeXY * vec2<f32>( 2.0 ) ) / vec2<f32>( 168.0, 98.0 ) ), vec2<f32>( 0.0 ), vec2<f32>( 1.0 ) );
	let rcProbeLocalPos = ( rcProbeUV * object.nodeUniform0 );
	let rcTheta = ( ( rcRayIndex + 0.5 ) * 0.09817477042468103 );
	let rcRayDirection = vec2<f32>( cos( rcTheta ), sin( rcTheta ) );
	let rcSegmentStartLocal = ( rcProbeLocalPos + ( rcRayDirection * vec2<f32>( object.nodeUniform1 ) ) );
	let rcSegmentStart = ( rcSegmentStartLocal + object.nodeUniform2 );

	if ( ( 0.0 > 0.5 ) ) {

		nodeVar0 = object.nodeUniform3;

	} else {

		nodeVar0 = object.nodeUniform3;

	}

	let rcTraceLimit = nodeVar0;
	nodeVar1 = vec3<f32>( 0.0, 0.0, 0.0 );
	nodeVar2 = 1.0;
	nodeVar3 = 0.0;
	nodeVar5 = ( abs( rcRayDirection.x ) < 0.000001 );
	nodeVar6 = ( object.nodeUniform4 + object.nodeUniform5 );
	nodeVar7 = ( abs( rcRayDirection.y ) < 0.000001 );

	if ( ( ( nodeVar5 && ( ( rcSegmentStart.x < object.nodeUniform4.x ) || ( rcSegmentStart.x > nodeVar6.x ) ) ) || ( nodeVar7 && ( ( rcSegmentStart.y < object.nodeUniform4.y ) || ( rcSegmentStart.y > nodeVar6.y ) ) ) ) ) {

		nodeVar4 = vec2<f32>( 1.0, -1.0 );

	} else {


		if ( nodeVar5 ) {

			nodeVar8 = 0.000001;

		} else {

			nodeVar8 = rcRayDirection.x;

		}


		if ( nodeVar7 ) {

			nodeVar9 = 0.000001;

		} else {

			nodeVar9 = rcRayDirection.y;

		}

		nodeVar10 = ( vec2<f32>( 1.0 ) / vec2<f32>( nodeVar8, nodeVar9 ) );
		nodeVar11 = ( ( object.nodeUniform4 - rcSegmentStart ) * nodeVar10 );
		nodeVar12 = ( ( nodeVar6 - rcSegmentStart ) * nodeVar10 );
		nodeVar4 = vec2<f32>( max( min( nodeVar11.x, nodeVar12.x ), min( nodeVar11.y, nodeVar12.y ) ), min( max( nodeVar11.x, nodeVar12.x ), max( nodeVar11.y, nodeVar12.y ) ) );

	}

	let rcBoundsInterval = nodeVar4;
	let rcTraceEntry = max( rcBoundsInterval.x, 0.0 );
	let rcTraceExit = min( rcBoundsInterval.y, rcTraceLimit );
	let rcIntersectsWorld = ( rcTraceExit >= rcTraceEntry );
	let nodeConst0 = vec2<f32>( 2.0, 2.0 );
	let nodeConst1 = 0.00196078431372549;
	let nodeConst2 = ( rcSegmentStart + ( rcRayDirection * vec2<f32>( rcTraceEntry ) ) );
	let nodeConst3 = clamp( ( ( nodeConst2 - object.nodeUniform4 ) / object.nodeUniform5 ), vec2<f32>( 0.0 ), vec2<f32>( 1.0 ) );
	let nodeConst4 = vec2<f32>( nodeConst3.x, ( 1.0 - nodeConst3.y ) );
	let nodeConst5 = clamp( ( nodeConst4 * nodeConst0 ), vec2<f32>( 0.0, 0.0 ), ( nodeConst0 - vec2<f32>( 0.0001 ) ) );
	let nodeConst6 = vec2<f32>( ( ( rcRayDirection.x / object.nodeUniform5.x ) * nodeConst0.x ), ( ( ( rcRayDirection.y / object.nodeUniform5.y ) * nodeConst0.y ) * -1.0 ) );
	let nodeConst7 = ( abs( nodeConst6.x ) < 1e-8 );
	let nodeConst8 = ( abs( nodeConst6.y ) < 1e-8 );

	if ( nodeConst7 ) {

		nodeVar13 = 0;

	} else {


		if ( ( nodeConst6.x > 0.0 ) ) {

			nodeVar14 = 1;

		} else {

			nodeVar14 = -1;

		}

		nodeVar13 = nodeVar14;

	}


	if ( nodeConst8 ) {

		nodeVar15 = 0;

	} else {


		if ( ( nodeConst6.y > 0.0 ) ) {

			nodeVar16 = 1;

		} else {

			nodeVar16 = -1;

		}

		nodeVar15 = nodeVar16;

	}

	let nodeConst9 = vec2<i32>( nodeVar13, nodeVar15 );
	let nodeConst10 = clamp( ( nodeConst5 + ( vec2<f32>( nodeConst9 ) * vec2<f32>( 0.00001 ) ) ), vec2<f32>( 0.0, 0.0 ), ( nodeConst0 - vec2<f32>( 0.0001 ) ) );
	nodeVar17 = vec2<i32>( i32( floor( nodeConst10.x ) ), i32( floor( nodeConst10.y ) ) );

	if ( ( nodeConst9.x > 0 ) ) {

		nodeVar18 = f32( ( nodeVar17.x + 1 ) );

	} else {

		nodeVar18 = f32( nodeVar17.x );

	}


	if ( ( nodeConst9.y > 0 ) ) {

		nodeVar19 = f32( ( nodeVar17.y + 1 ) );

	} else {

		nodeVar19 = f32( nodeVar17.y );

	}

	let nodeConst11 = vec2<f32>( nodeVar18, nodeVar19 );
	let nodeConst12 = i32( floor( ( ( clamp( ( 1.0 / abs( nodeConst6.x ) ), 0.0, 262143.99975585938 ) * 4096.0 ) + 0.5 ) ) );
	let nodeConst13 = i32( floor( ( ( clamp( ( 1.0 / abs( nodeConst6.y ) ), 0.0, 262143.99975585938 ) * 4096.0 ) + 0.5 ) ) );

	if ( ( nodeConst12 < 1 ) ) {

		nodeVar20 = 1;

	} else {

		nodeVar20 = nodeConst12;

	}

	let nodeConst14 = nodeVar20;

	if ( ( nodeConst13 < 1 ) ) {

		nodeVar21 = 1;

	} else {

		nodeVar21 = nodeConst13;

	}

	let nodeConst15 = nodeVar21;

	if ( nodeConst7 ) {

		nodeVar22 = 1073741823;

	} else {

		nodeVar22 = nodeConst14;

	}


	if ( nodeConst8 ) {

		nodeVar23 = 1073741823;

	} else {

		nodeVar23 = nodeConst15;

	}

	let nodeConst16 = vec2<i32>( nodeVar22, nodeVar23 );

	if ( nodeConst7 ) {

		nodeVar24 = 1073741823;

	} else {

		nodeVar24 = i32( floor( ( ( clamp( ( ( nodeConst11.x - nodeConst5.x ) / nodeConst6.x ), 0.0, 262143.99975585938 ) * 4096.0 ) + 0.5 ) ) );

	}


	if ( nodeConst8 ) {

		nodeVar25 = 1073741823;

	} else {

		nodeVar25 = i32( floor( ( ( clamp( ( ( nodeConst11.y - nodeConst5.y ) / nodeConst6.y ), 0.0, 262143.99975585938 ) * 4096.0 ) + 0.5 ) ) );

	}

	nodeVar26 = vec2<i32>( nodeVar24, nodeVar25 );
	let nodeConst17 = i32( floor( ( ( clamp( max( ( rcTraceExit - rcTraceEntry ), 0.0 ), 0.0, 262143.99975585938 ) * 4096.0 ) + 0.5 ) ) );
	nodeVar27 = vec3<f32>( 0.0, 0.0, 0.0 );

	if ( ( ! rcIntersectsWorld ) ) {

		nodeVar28 = 1.0;

	} else {

		nodeVar28 = 0.0;

	}

	nodeVar29 = nodeVar28;

	if ( rcIntersectsWorld ) {

		nodeVar30 = 1.0;

	} else {

		nodeVar30 = 0.0;

	}

	nodeVar31 = nodeVar30;
	nodeVar32 = 0.0;

	if ( rcIntersectsWorld ) {


		for ( var i : i32 = 0; i < 4; i ++ ) {

			nodeVar34 = ( nodeVar17.x >> 1u );

			if ( ( nodeVar34 < 0 ) ) {

				nodeVar33 = 0;

			} else {


				if ( ( nodeVar34 > 0 ) ) {

					nodeVar35 = 0;

				} else {

					nodeVar35 = nodeVar34;

				}

				nodeVar33 = nodeVar35;

			}

			nodeVar37 = ( nodeVar17.y >> 1u );

			if ( ( nodeVar37 < 0 ) ) {

				nodeVar36 = 0;

			} else {


				if ( ( nodeVar37 > 0 ) ) {

					nodeVar38 = 0;

				} else {

					nodeVar38 = nodeVar37;

				}

				nodeVar36 = nodeVar38;

			}

			let nodeConst18 = vec2<i32>( nodeVar33, nodeVar36 );
			nodeVar39 = textureLoad( nodeUniform6, nodeConst18, u32( 0u ) );
			let nodeConst19 = nodeVar39.xyz;
			let nodeConst20 = nodeConst19;
			let nodeConst21 = ( ( ( ( ( nodeConst20.x < nodeConst1 ) && ( nodeConst20.y < nodeConst1 ) ) && ( nodeConst20.z < nodeConst1 ) ) && ( nodeVar31 < 0.5 ) ) && ( nodeVar32 < 0.5 ) );

			if ( nodeConst21 ) {

				let nodeConst22 = ( nodeVar17.x & 1 );
				let nodeConst23 = ( nodeVar17.y & 1 );

				if ( ( nodeConst9.x > 0 ) ) {

					nodeVar40 = ( 2 - nodeConst22 );

				} else {

					nodeVar40 = ( nodeConst22 + 1 );

				}

				let nodeConst24 = nodeVar40;

				if ( ( nodeConst9.y > 0 ) ) {

					nodeVar41 = ( 2 - nodeConst23 );

				} else {

					nodeVar41 = ( nodeConst23 + 1 );

				}

				let nodeConst25 = nodeVar41;

				if ( nodeConst7 ) {

					nodeVar42 = 1073741823;

				} else {

					nodeVar42 = ( nodeVar26.x + ( nodeConst16.x * ( nodeConst24 - 1 ) ) );

				}

				let nodeConst26 = nodeVar42;

				if ( nodeConst8 ) {

					nodeVar43 = 1073741823;

				} else {

					nodeVar43 = ( nodeVar26.y + ( nodeConst16.y * ( nodeConst25 - 1 ) ) );

				}

				let nodeConst27 = nodeVar43;
				let nodeConst28 = ( abs( ( nodeConst26 - nodeConst27 ) ) <= 1 );

				if ( ( ! nodeConst28 ) ) {


					if ( ( nodeConst26 < nodeConst27 ) ) {

						nodeVar44 = nodeConst26;

					} else {

						nodeVar44 = nodeConst27;

					}

					let nodeConst29 = nodeVar44;

					if ( ( nodeConst29 >= nodeConst17 ) ) {

						nodeVar29 = 1.0;
						break;


					}


					if ( ( nodeConst26 < nodeConst27 ) ) {


						if ( ( nodeVar26.y <= nodeConst29 ) ) {

							nodeVar45 = ( ( ( nodeConst29 - nodeVar26.y ) / nodeConst16.y ) + 1 );

						} else {

							nodeVar45 = 0;

						}

						let nodeConst30 = nodeVar45;
						nodeVar17.x = ( nodeVar17.x + ( nodeConst9.x * nodeConst24 ) );
						nodeVar17.y = ( nodeVar17.y + ( nodeConst9.y * nodeConst30 ) );
						nodeVar26.x = ( nodeVar26.x + ( nodeConst16.x * nodeConst24 ) );
						nodeVar26.y = ( nodeVar26.y + ( nodeConst16.y * nodeConst30 ) );
						continue;


					} else {


						if ( ( nodeVar26.x <= nodeConst29 ) ) {

							nodeVar46 = ( ( ( nodeConst29 - nodeVar26.x ) / nodeConst16.x ) + 1 );

						} else {

							nodeVar46 = 0;

						}

						let nodeConst31 = nodeVar46;
						nodeVar17.x = ( nodeVar17.x + ( nodeConst9.x * nodeConst31 ) );
						nodeVar17.y = ( nodeVar17.y + ( nodeConst9.y * nodeConst25 ) );
						nodeVar26.x = ( nodeVar26.x + ( nodeConst16.x * nodeConst31 ) );
						nodeVar26.y = ( nodeVar26.y + ( nodeConst16.y * nodeConst25 ) );
						continue;


					}



				}



			}

			nodeVar48 = ( nodeVar17.x >> 1u );

			if ( ( nodeVar48 < 0 ) ) {

				nodeVar47 = 0;

			} else {


				if ( ( nodeVar48 > 0 ) ) {

					nodeVar49 = 0;

				} else {

					nodeVar49 = nodeVar48;

				}

				nodeVar47 = nodeVar49;

			}

			nodeVar51 = ( nodeVar17.y >> 1u );

			if ( ( nodeVar51 < 0 ) ) {

				nodeVar50 = 0;

			} else {


				if ( ( nodeVar51 > 0 ) ) {

					nodeVar52 = 0;

				} else {

					nodeVar52 = nodeVar51;

				}

				nodeVar50 = nodeVar52;

			}

			let nodeConst32 = vec2<i32>( nodeVar47, nodeVar50 );
			nodeVar53 = textureLoad( nodeUniform6, nodeConst32, u32( 0u ) );
			let nodeConst33 = nodeVar53.xyz;
			let nodeConst34 = u32( floor( ( ( nodeConst33.x * 255.0 ) + 0.5 ) ) );
			let nodeConst35 = u32( floor( ( ( nodeConst33.y * 255.0 ) + 0.5 ) ) );
			let nodeConst36 = u32( floor( ( ( nodeConst33.z * 255.0 ) + 0.5 ) ) );
			let nodeConst37 = u32( ( ( nodeVar17.x & 1 ) + ( ( nodeVar17.y & 1 ) * 2 ) ) );
			let nodeConst38 = ( 1u << nodeConst37 );

			if ( ( ( nodeConst34 & nodeConst38 ) > 0u ) ) {

				nodeVar54 = 1.0;

			} else {

				nodeVar54 = 0.0;

			}


			if ( ( ( nodeConst35 & nodeConst38 ) > 0u ) ) {

				nodeVar55 = 1.0;

			} else {

				nodeVar55 = 0.0;

			}


			if ( ( ( nodeConst36 & nodeConst38 ) > 0u ) ) {

				nodeVar56 = 1.0;

			} else {

				nodeVar56 = 0.0;

			}

			let nodeConst39 = vec3<f32>( nodeVar54, nodeVar55, nodeVar56 );

			if ( ( nodeConst39.z > 0.5 ) ) {

				nodeVar57 = textureLoad( nodeUniform7, nodeVar17, u32( 0u ) );
				let nodeConst40 = nodeVar57.xyz;

				if ( ( dot( nodeConst40, nodeConst40 ) > 1e-10 ) ) {

					nodeVar27 = nodeConst40;
					nodeVar29 = 2.0;
					break;


				}



			}

			let nodeConst41 = ( nodeConst39.x > 0.5 );
			let nodeConst42 = ( nodeConst39.y > 0.5 );

			if ( ( ( nodeVar31 > 0.5 ) && ( ! nodeConst41 ) ) ) {

				nodeVar31 = 0.0;


			}

			let nodeConst43 = ( nodeVar31 < 0.5 );

			if ( ( ( nodeConst43 && ( nodeVar32 > 0.5 ) ) && ( ! nodeConst42 ) ) ) {

				nodeVar29 = -1.0;
				break;


			}


			if ( ( ( nodeConst43 && nodeConst41 ) && ( ! nodeConst42 ) ) ) {

				nodeVar29 = -1.0;
				break;


			}


			if ( ( nodeConst43 && nodeConst42 ) ) {

				nodeVar32 = 1.0;


			}


			if ( ( nodeVar26.x < nodeVar26.y ) ) {

				nodeVar58 = nodeVar26.x;

			} else {

				nodeVar58 = nodeVar26.y;

			}

			let nodeConst44 = nodeVar58;

			if ( ( nodeConst44 >= nodeConst17 ) ) {


				if ( ( nodeVar32 > 0.5 ) ) {

					nodeVar59 = -1.0;

				} else {

					nodeVar59 = 1.0;

				}

				nodeVar29 = nodeVar59;
				break;


			}

			let nodeConst45 = ( abs( ( nodeVar26.x - nodeVar26.y ) ) <= 1 );
			let nodeConst46 = ( ( ! nodeConst45 ) && ( nodeVar26.x < nodeVar26.y ) );
			let nodeConst47 = ( ( ! nodeConst45 ) && ( nodeVar26.y < nodeVar26.x ) );

			if ( nodeConst45 ) {

				let nodeConst48 = vec2<i32>( ( nodeVar17.x + nodeConst9.x ), nodeVar17.y );
				let nodeConst49 = vec2<i32>( nodeVar17.x, ( nodeVar17.y + nodeConst9.y ) );
				nodeVar61 = ( nodeConst48.x >> 1u );

				if ( ( nodeVar61 < 0 ) ) {

					nodeVar60 = 0;

				} else {


					if ( ( nodeVar61 > 0 ) ) {

						nodeVar62 = 0;

					} else {

						nodeVar62 = nodeVar61;

					}

					nodeVar60 = nodeVar62;

				}

				nodeVar64 = ( nodeConst48.y >> 1u );

				if ( ( nodeVar64 < 0 ) ) {

					nodeVar63 = 0;

				} else {


					if ( ( nodeVar64 > 0 ) ) {

						nodeVar65 = 0;

					} else {

						nodeVar65 = nodeVar64;

					}

					nodeVar63 = nodeVar65;

				}

				let nodeConst50 = vec2<i32>( nodeVar60, nodeVar63 );
				nodeVar66 = textureLoad( nodeUniform6, nodeConst50, u32( 0u ) );
				let nodeConst51 = nodeVar66.xyz;
				let nodeConst52 = u32( floor( ( ( nodeConst51.x * 255.0 ) + 0.5 ) ) );
				let nodeConst53 = u32( floor( ( ( nodeConst51.y * 255.0 ) + 0.5 ) ) );
				let nodeConst54 = u32( floor( ( ( nodeConst51.z * 255.0 ) + 0.5 ) ) );
				let nodeConst55 = u32( ( ( nodeConst48.x & 1 ) + ( ( nodeConst48.y & 1 ) * 2 ) ) );
				let nodeConst56 = ( 1u << nodeConst55 );

				if ( ( ( nodeConst52 & nodeConst56 ) > 0u ) ) {

					nodeVar67 = 1.0;

				} else {

					nodeVar67 = 0.0;

				}


				if ( ( ( nodeConst53 & nodeConst56 ) > 0u ) ) {

					nodeVar68 = 1.0;

				} else {

					nodeVar68 = 0.0;

				}


				if ( ( ( nodeConst54 & nodeConst56 ) > 0u ) ) {

					nodeVar69 = 1.0;

				} else {

					nodeVar69 = 0.0;

				}

				let nodeConst57 = vec3<f32>( nodeVar67, nodeVar68, nodeVar69 );
				nodeVar71 = ( nodeConst49.x >> 1u );

				if ( ( nodeVar71 < 0 ) ) {

					nodeVar70 = 0;

				} else {


					if ( ( nodeVar71 > 0 ) ) {

						nodeVar72 = 0;

					} else {

						nodeVar72 = nodeVar71;

					}

					nodeVar70 = nodeVar72;

				}

				nodeVar74 = ( nodeConst49.y >> 1u );

				if ( ( nodeVar74 < 0 ) ) {

					nodeVar73 = 0;

				} else {


					if ( ( nodeVar74 > 0 ) ) {

						nodeVar75 = 0;

					} else {

						nodeVar75 = nodeVar74;

					}

					nodeVar73 = nodeVar75;

				}

				let nodeConst58 = vec2<i32>( nodeVar70, nodeVar73 );
				nodeVar76 = textureLoad( nodeUniform6, nodeConst58, u32( 0u ) );
				let nodeConst59 = nodeVar76.xyz;
				let nodeConst60 = u32( floor( ( ( nodeConst59.x * 255.0 ) + 0.5 ) ) );
				let nodeConst61 = u32( floor( ( ( nodeConst59.y * 255.0 ) + 0.5 ) ) );
				let nodeConst62 = u32( floor( ( ( nodeConst59.z * 255.0 ) + 0.5 ) ) );
				let nodeConst63 = u32( ( ( nodeConst49.x & 1 ) + ( ( nodeConst49.y & 1 ) * 2 ) ) );
				let nodeConst64 = ( 1u << nodeConst63 );

				if ( ( ( nodeConst60 & nodeConst64 ) > 0u ) ) {

					nodeVar77 = 1.0;

				} else {

					nodeVar77 = 0.0;

				}


				if ( ( ( nodeConst61 & nodeConst64 ) > 0u ) ) {

					nodeVar78 = 1.0;

				} else {

					nodeVar78 = 0.0;

				}


				if ( ( ( nodeConst62 & nodeConst64 ) > 0u ) ) {

					nodeVar79 = 1.0;

				} else {

					nodeVar79 = 0.0;

				}

				let nodeConst65 = vec3<f32>( nodeVar77, nodeVar78, nodeVar79 );
				nodeVar80 = vec3<f32>( 0.0, 0.0, 0.0 );
				nodeVar81 = vec3<f32>( 0.0, 0.0, 0.0 );

				if ( ( nodeConst57.z > 0.5 ) ) {

					nodeVar82 = textureLoad( nodeUniform7, nodeConst48, u32( 0u ) );
					let nodeConst66 = nodeVar82.xyz;
					nodeVar80 = nodeConst66;


				}


				if ( ( nodeConst65.z > 0.5 ) ) {

					nodeVar83 = textureLoad( nodeUniform7, nodeConst49, u32( 0u ) );
					let nodeConst67 = nodeVar83.xyz;
					nodeVar81 = nodeConst67;


				}


				if ( ( dot( nodeVar80, nodeVar80 ) > dot( nodeVar81, nodeVar81 ) ) ) {

					nodeVar84 = nodeVar80;

				} else {

					nodeVar84 = nodeVar81;

				}


				if ( ( dot( nodeVar84, nodeVar84 ) > 1e-10 ) ) {

					nodeVar27 = nodeVar84;
					nodeVar29 = 2.0;
					break;


				}

				let nodeConst68 = ( nodeConst57.y > 0.5 );
				let nodeConst69 = ( nodeConst65.y > 0.5 );
				let nodeConst70 = ( ( nodeConst57.x > 0.5 ) && ( ! nodeConst68 ) );
				let nodeConst71 = ( ( nodeConst65.x > 0.5 ) && ( ! nodeConst69 ) );
				let nodeConst72 = ( nodeVar31 < 0.5 );

				if ( ( nodeConst72 && ( nodeConst70 || nodeConst71 ) ) ) {

					nodeVar29 = -1.0;
					break;


				}


				if ( ( nodeConst72 && ( nodeConst68 || nodeConst69 ) ) ) {

					nodeVar32 = 1.0;


				}


				if ( ( ( nodeConst72 && ( nodeVar32 > 0.5 ) ) && ( ! ( nodeConst68 || nodeConst69 ) ) ) ) {

					nodeVar29 = -1.0;
					break;


				}

				nodeVar17.x = ( nodeVar17.x + nodeConst9.x );
				nodeVar17.y = ( nodeVar17.y + nodeConst9.y );
				nodeVar26.x = ( nodeVar26.x + nodeConst16.x );
				nodeVar26.y = ( nodeVar26.y + nodeConst16.y );


			}


			if ( nodeConst46 ) {

				nodeVar17.x = ( nodeVar17.x + nodeConst9.x );
				nodeVar26.x = ( nodeVar26.x + nodeConst16.x );


			}


			if ( nodeConst47 ) {

				nodeVar17.y = ( nodeVar17.y + nodeConst9.y );
				nodeVar26.y = ( nodeVar26.y + nodeConst16.y );


			}


		}



	}

	nodeVar85 = vec4<f32>( nodeVar27, nodeVar29 );
	nodeVar1 = nodeVar85.xyz;

	if ( ( ( nodeVar85.w < -0.5 ) || ( nodeVar85.w > 1.5 ) ) ) {

		nodeVar86 = 0.0;

	} else {

		nodeVar86 = 1.0;

	}

	nodeVar2 = nodeVar86;

	if ( ( ( nodeVar85.w > 0.5 ) && ( nodeVar85.w < 1.5 ) ) ) {

		nodeVar87 = 1.0;

	} else {

		nodeVar87 = 0.0;

	}

	nodeVar3 = nodeVar87;

	if ( ( ( ( nodeVar2 > 0.5 ) && ( nodeVar3 > 0.5 ) ) && ( 0.0 > 0.5 ) ) ) {

		nodeVar1 = vec3<f32>( 0.0, 0.0, 0.0 );
		nodeVar2 = 0.0;


	}

	nodeVar88 = nodeVar1;
	nodeVar89 = nodeVar2;

	if ( ( nodeVar2 > 0.0 ) ) {

		nodeVar90 = vec3<f32>( 0.0, 0.0, 0.0 );
		nodeVar91 = 0.0;
		nodeVar92 = ( ( rcRayIndex * 4.0 ) + 0.0 );
		nodeVar93 = clamp( ( rcProbeXY * vec2<f32>( 0.5 ) ), vec2<f32>( 0.5, 0.5 ), vec2<f32>( 41.5, 24.5 ) );
		nodeVar94 = textureSample( nodeUniform8, nodeUniform8_sampler, ( ( ( vec2<f32>( tsl_mod_float( nodeVar92, 16.0 ), floor( ( nodeVar92 / 16.0 ) ) ) * vec2<f32>( 42.0, 26.0 ) ) + nodeVar93 ) / vec2<f32>( 672.0, 416.0 ) ) );
		nodeVar95 = vec4<f32>( ( nodeVar94.xyz * vec3<f32>( object.nodeUniform9 ) ), nodeVar94.w );
		nodeVar90 = ( nodeVar90 + nodeVar95.xyz );
		nodeVar91 = ( nodeVar91 + nodeVar95.w );
		nodeVar96 = ( ( rcRayIndex * 4.0 ) + 1.0 );
		nodeVar97 = textureSample( nodeUniform8, nodeUniform8_sampler, ( ( ( vec2<f32>( tsl_mod_float( nodeVar96, 16.0 ), floor( ( nodeVar96 / 16.0 ) ) ) * vec2<f32>( 42.0, 26.0 ) ) + nodeVar93 ) / vec2<f32>( 672.0, 416.0 ) ) );
		nodeVar98 = vec4<f32>( ( nodeVar97.xyz * vec3<f32>( object.nodeUniform9 ) ), nodeVar97.w );
		nodeVar90 = ( nodeVar90 + nodeVar98.xyz );
		nodeVar91 = ( nodeVar91 + nodeVar98.w );
		nodeVar99 = ( ( rcRayIndex * 4.0 ) + 2.0 );
		nodeVar100 = textureSample( nodeUniform8, nodeUniform8_sampler, ( ( ( vec2<f32>( tsl_mod_float( nodeVar99, 16.0 ), floor( ( nodeVar99 / 16.0 ) ) ) * vec2<f32>( 42.0, 26.0 ) ) + nodeVar93 ) / vec2<f32>( 672.0, 416.0 ) ) );
		nodeVar101 = vec4<f32>( ( nodeVar100.xyz * vec3<f32>( object.nodeUniform9 ) ), nodeVar100.w );
		nodeVar90 = ( nodeVar90 + nodeVar101.xyz );
		nodeVar91 = ( nodeVar91 + nodeVar101.w );
		nodeVar102 = ( ( rcRayIndex * 4.0 ) + 3.0 );
		nodeVar103 = textureSample( nodeUniform8, nodeUniform8_sampler, ( ( ( vec2<f32>( tsl_mod_float( nodeVar102, 16.0 ), floor( ( nodeVar102 / 16.0 ) ) ) * vec2<f32>( 42.0, 26.0 ) ) + nodeVar93 ) / vec2<f32>( 672.0, 416.0 ) ) );
		nodeVar104 = vec4<f32>( ( nodeVar103.xyz * vec3<f32>( object.nodeUniform9 ) ), nodeVar103.w );
		nodeVar90 = ( nodeVar90 + nodeVar104.xyz );
		nodeVar91 = ( nodeVar91 + nodeVar104.w );
		nodeVar90 = ( nodeVar90 * vec3<f32>( 0.25 ) );
		nodeVar91 = ( nodeVar91 * 0.25 );
		nodeVar88 = ( nodeVar88 + ( vec3<f32>( nodeVar89 ) * nodeVar90 ) );
		nodeVar89 = ( nodeVar89 * nodeVar91 );


	}

	nodeVar105 = vec4<f32>( nodeVar88, nodeVar89 );

	// result

	output.color = vec4<f32>( ( floor( ( ( clamp( ( nodeVar105.xyz / vec3<f32>( object.nodeUniform9 ) ), vec3<f32>( 0.0 ), vec3<f32>( 1.0 ) ) * vec3<f32>( object.nodeUniform10 ) ) + vec3<f32>( 0.5 ) ) ) / vec3<f32>( object.nodeUniform10 ) ), ( floor( ( ( clamp( nodeVar105.w, 0.0, 1.0 ) * object.nodeUniform10 ) + 0.5 ) ) / object.nodeUniform10 ) );

	return output;

}
